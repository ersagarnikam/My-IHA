package com.iha.doctor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.iha.auth.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Registration fee, annual renewal, fee history and invoices. */
@RestController
@RequestMapping("/api/doctor/billing")
public class DoctorBillingController {

	private final DoctorFeeService fees;

	DoctorBillingController(DoctorFeeService fees) {
		this.fees = fees;
	}

	@GetMapping
	public BillingResponse billing(@AuthenticationPrincipal Jwt jwt) {
		DoctorFeeService.Billing b = fees.billing(CurrentUser.from(jwt));
		return new BillingResponse(b.fees().registrationFeeAud(), b.fees().annualFeeAud(), b.registrationFeePaidAt(),
				b.annualFeeNextDueAt(), b.annualFeeDue(), b.provider(), b.publishableKey(),
				b.payments().stream().map(FeePaymentResponse::of).toList());
	}

	/** The current fee amounts (shown during registration, before a doctor row exists). */
	@GetMapping("/fees")
	public DoctorFeeService.Fees feeAmounts() {
		return fees.fees();
	}

	/** {@code feeType}: registration or annual. Returns the intent to complete in the browser. */
	@PostMapping("/checkout")
	public DoctorFeeService.Checkout checkout(@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody CheckoutRequest request) {
		return fees.checkout(CurrentUser.from(jwt), request.feeType());
	}

	/** Only works with the simulated provider (404 otherwise). */
	@PostMapping("/simulate/{intentId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void simulate(@AuthenticationPrincipal Jwt jwt, @PathVariable String intentId) {
		fees.simulate(CurrentUser.from(jwt), intentId);
	}

	@GetMapping("/payments/{paymentId}/invoice")
	public ResponseEntity<byte[]> invoice(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID paymentId,
			@RequestParam(defaultValue = "true") boolean download) {
		DoctorFeeService.Invoice invoice = fees.invoice(CurrentUser.from(jwt), paymentId);
		ContentDisposition disposition = (download ? ContentDisposition.attachment() : ContentDisposition.inline())
			.filename(invoice.fileName())
			.build();
		return ResponseEntity.ok()
			.contentType(MediaType.APPLICATION_PDF)
			.header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
			.header(HttpHeaders.CACHE_CONTROL, "private, no-store")
			.body(invoice.content());
	}

	public record CheckoutRequest(@NotBlank String feeType) {
	}

	public record FeePaymentResponse(UUID id, String feeType, BigDecimal amountAud, String billingPeriod,
			String status, String gatewayReference, Instant paidAt, Instant createdAt) {

		static FeePaymentResponse of(DoctorFeePayment p) {
			return new FeePaymentResponse(p.getId(), p.getFeeType(), p.getAmountAud(), p.getBillingPeriod(),
					p.getStatus(), p.getGatewayReference(), p.getPaidAt(), p.getCreatedAt());
		}

	}

	public record BillingResponse(BigDecimal registrationFeeAud, BigDecimal annualFeeAud,
			Instant registrationFeePaidAt, Instant annualFeeNextDueAt, boolean annualFeeDue, String provider,
			String publishableKey, List<FeePaymentResponse> payments) {
	}

}
