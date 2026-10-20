package com.iha.payment;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import com.iha.auth.CurrentUser;
import com.iha.cases.CaseRepository;
import com.iha.cases.MedicalCase;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestHeader;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class PaymentController {

	private final PaymentService payments;
	private final InvoiceService invoices;
	private final CaseRepository cases;

	public PaymentController(PaymentService payments, InvoiceService invoices, CaseRepository cases) {
		this.payments = payments;
		this.invoices = invoices;
		this.cases = cases;
	}

	@GetMapping("/api/patient/payments/config")
	public ProviderConfig config() {
		return new ProviderConfig(payments.provider(), payments.publishableKey());
	}

	@GetMapping("/api/patient/payments")
	public List<PaymentResponse> history(@AuthenticationPrincipal Jwt jwt) {
		List<Payment> list = payments.history(CurrentUser.from(jwt));
		Map<UUID, String> references = cases.findAllById(list.stream().map(Payment::getCaseId).distinct().toList())
			.stream()
			.collect(Collectors.toMap(MedicalCase::getId, MedicalCase::getReferenceNumber));
		return list.stream().map(p -> PaymentResponse.of(p, references.get(p.getCaseId()))).toList();
	}

	@PostMapping("/api/patient/cases/{caseId}/checkout")
	public PaymentService.Checkout treatmentCheckout(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId) {
		return payments.startTreatmentCheckout(CurrentUser.from(jwt), caseId);
	}

	@PostMapping("/api/patient/consultations/{requestId}/checkout")
	public PaymentService.Checkout consultationCheckout(@AuthenticationPrincipal Jwt jwt,
			@PathVariable UUID requestId) {
		return payments.startConsultationCheckout(CurrentUser.from(jwt), requestId);
	}

	/** Only works with the simulated provider (404 otherwise). */
	@PostMapping("/api/patient/payments/simulate/{intentId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void simulate(@AuthenticationPrincipal Jwt jwt, @PathVariable String intentId) {
		payments.simulateSuccess(CurrentUser.from(jwt), intentId);
	}

	@GetMapping("/api/patient/payments/{paymentId}/invoice")
	public ResponseEntity<byte[]> invoice(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID paymentId,
			@RequestParam(defaultValue = "false") boolean download) {
		InvoiceService.Rendered invoice = invoices.invoice(CurrentUser.from(jwt), paymentId);
		ContentDisposition disposition = (download ? ContentDisposition.attachment() : ContentDisposition.inline())
			.filename(invoice.fileName())
			.build();
		return ResponseEntity.ok()
			.contentType(MediaType.APPLICATION_PDF)
			.header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
			.body(invoice.content());
	}

	@GetMapping("/api/patient/payment-methods")
	public List<CardResponse> cards(@AuthenticationPrincipal Jwt jwt) {
		return payments.cards(CurrentUser.from(jwt)).stream().map(CardResponse::of).toList();
	}

	@PostMapping("/api/patient/payment-methods")
	@ResponseStatus(HttpStatus.CREATED)
	public CardResponse addCard(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody AddCardRequest request) {
		return CardResponse.of(payments.addCard(CurrentUser.from(jwt), request.paymentMethodId()));
	}

	@PostMapping("/api/patient/payment-methods/{id}/default")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void setDefault(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
		payments.setDefaultCard(CurrentUser.from(jwt), id);
	}

	@DeleteMapping("/api/patient/payment-methods/{id}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void removeCard(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
		payments.removeCard(CurrentUser.from(jwt), id);
	}

	/** Public: authenticated by the provider's signature instead of a JWT. */
	@PostMapping("/api/payments/webhook")
	public Map<String, Boolean> webhook(@RequestBody String payload,
			@RequestHeader(name = "Stripe-Signature", required = false) String signature) {
		payments.handleWebhook(payload, signature);
		return Map.of("received", true);
	}

	public record ProviderConfig(String provider, String publishableKey) {
	}

	public record AddCardRequest(@NotBlank String paymentMethodId) {
	}

	public record CardResponse(UUID id, String brand, String last4, int expMonth, int expYear, boolean isDefault,
			Instant createdAt) {

		static CardResponse of(PaymentMethod m) {
			return new CardResponse(m.getId(), m.getBrand(), m.getLast4(), m.getExpMonth(), m.getExpYear(),
					m.isDefaultMethod(), m.getCreatedAt());
		}

	}

	public record PaymentResponse(UUID id, UUID caseId, String caseReference, String paymentType,
			UUID consultationRequestId, BigDecimal amountAud, String status, String gatewayReference, Instant paidAt,
			Instant createdAt) {

		public static PaymentResponse of(Payment p, String caseReference) {
			return new PaymentResponse(p.getId(), p.getCaseId(), caseReference, p.getPaymentType(),
					p.getConsultationRequestId(), p.getAmountAud(), p.getStatus(), p.getGatewayReference(),
					p.getPaidAt(), p.getCreatedAt());
		}

	}

}
