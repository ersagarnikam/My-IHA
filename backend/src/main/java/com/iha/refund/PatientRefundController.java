package com.iha.refund;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.cases.CaseRepository;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.patient.Patient;
import com.iha.patient.PatientService;
import com.iha.payment.InvoiceRenderer;
import com.iha.payment.InvoiceService;
import com.iha.payment.Payment;
import com.iha.payment.PaymentRepository;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** A patient's credit note for a refund of one of their payments. */
@RestController
public class PatientRefundController {

	private final PaymentRefundRepository refunds;
	private final PaymentRepository payments;
	private final PatientService patientService;
	private final CaseRepository cases;
	private final InvoiceRenderer renderer;
	private final AuditService audit;
	private final InvoiceService invoices;

	PatientRefundController(PaymentRefundRepository refunds, PaymentRepository payments, PatientService patientService,
			CaseRepository cases, InvoiceRenderer renderer, AuditService audit, InvoiceService invoices) {
		this.refunds = refunds;
		this.payments = payments;
		this.patientService = patientService;
		this.cases = cases;
		this.renderer = renderer;
		this.audit = audit;
		this.invoices = invoices;
	}

	private static BigDecimal gstPart(BigDecimal amount, BigDecimal share) {
		return share.signum() == 0 ? null : amount.multiply(share).setScale(2, RoundingMode.HALF_UP);
	}

	@GetMapping("/api/patient/refunds/{refundId}/credit-note")
	@Transactional(readOnly = true)
	public ResponseEntity<byte[]> creditNote(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID refundId,
			@RequestParam(defaultValue = "false") boolean download) {
		CurrentUser user = CurrentUser.from(jwt);
		Patient patient = patientService.requireCurrent(user);
		PaymentRefund refund = refunds.findById(refundId)
			.filter(r -> RefundService.PATIENT.equals(r.getPaymentKind()) && r.counts())
			.orElseThrow(() -> ApiException.notFound("Refund not found."));
		Payment payment = payments.findByIdAndPatientId(refund.getPaymentId(), patient.getId())
			.orElseThrow(() -> ApiException.notFound("Refund not found."));
		String reference = cases.findById(payment.getCaseId()).map(MedicalCase::getReferenceNumber).orElse("");
		String what = Payment.CONSULTATION_FEE.equals(payment.getPaymentType()) ? "online consultation fee"
				: "treatment payment";
		// The GST in a refund follows the GST share of the original payment.
		BigDecimal share = invoices.gstShare(payment);
		List<InvoiceRenderer.Line> lines = new ArrayList<>();
		lines.add(new InvoiceRenderer.Line("Refund of " + what, refund.getAmountAud(), gstPart(refund.getAmountAud(), share)));
		if (refund.getFeeDeductedAud().signum() > 0) {
			lines.add(new InvoiceRenderer.Line("Less card processing fee", refund.getFeeDeductedAud().negate(),
					gstPart(refund.getFeeDeductedAud().negate(), share)));
		}
		String number = "CN-" + reference + "-" + refund.getId().toString().substring(0, 6).toUpperCase();
		byte[] pdf = renderer.render(new InvoiceRenderer.Invoice(number, refund.getCreatedAt(), "Case", reference,
				refund.getGatewayRefundId(), patient.getFullName(), user.email(), null, lines, refund.getRefundedAud(),
				"CREDIT NOTE", "Total refunded",
				"Refunds go back to the original card and usually arrive within 5-10 business days."));
		audit.record(user.id(), user.email(), "patient", "payment.credit_note_downloaded", "payment_refund", refundId,
				Map.of());
		ContentDisposition disposition = (download ? ContentDisposition.attachment() : ContentDisposition.inline())
			.filename("credit-note-" + reference + ".pdf")
			.build();
		return ResponseEntity.ok()
			.contentType(MediaType.APPLICATION_PDF)
			.header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
			.body(pdf);
	}

}
