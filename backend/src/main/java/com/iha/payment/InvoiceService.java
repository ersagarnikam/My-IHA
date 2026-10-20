package com.iha.payment;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.cases.CaseRepository;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.patient.PatientService;
import com.iha.treatment.TreatmentOptionRepository;
import com.iha.treatment.TreatmentOptionViews;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Builds invoices for completed payments. Unlike the old route, consultation
 * fees get their own line instead of an empty "Treatment Payment".
 */
@Service
public class InvoiceService {

	private final PaymentService payments;
	private final PatientService patientService;
	private final CaseRepository cases;
	private final TreatmentOptionRepository options;
	private final TreatmentOptionViews optionViews;
	private final InvoiceRenderer renderer;
	private final AuditService audit;

	InvoiceService(PaymentService payments, PatientService patientService, CaseRepository cases,
			TreatmentOptionRepository options, TreatmentOptionViews optionViews, InvoiceRenderer renderer,
			AuditService audit) {
		this.payments = payments;
		this.patientService = patientService;
		this.cases = cases;
		this.options = options;
		this.optionViews = optionViews;
		this.renderer = renderer;
		this.audit = audit;
	}

	@Transactional(readOnly = true)
	public Rendered invoice(CurrentUser user, UUID paymentId) {
		Payment payment = payments.requireOwned(user, paymentId);
		if (!payment.isCompleted()) {
			throw ApiException.conflict("payment_not_completed", "An invoice is available once the payment completes.");
		}
		String reference = cases.findById(payment.getCaseId()).map(MedicalCase::getReferenceNumber).orElse("");
		String hospital = null;
		List<InvoiceRenderer.Line> lines;
		if (Payment.FULL_PAYMENT.equals(payment.getPaymentType()) && payment.getTreatmentOptionId() != null) {
			TreatmentOptionViews.OptionView option = options.findById(payment.getTreatmentOptionId())
				.map(optionViews::build)
				.orElseThrow();
			hospital = option.hospital() != null ? option.hospital().name() : null;
			lines = option.costBreakdown().items().stream()
				.map(i -> new InvoiceRenderer.Line(i.label(), i.amount()))
				.toList();
		}
		else {
			lines = List.of(new InvoiceRenderer.Line("Online consultation fee", payment.getAmountAud()));
		}
		byte[] pdf = renderer.render(new InvoiceRenderer.Invoice(reference + "-" + payment.getId().toString().substring(0, 6).toUpperCase(),
				payment.getPaidAt(), "Case", reference, payment.getGatewayReference(),
				patientService.requireCurrent(user).getFullName(), user.email(), hospital, lines, payment.getAmountAud()));
		audit.record(user.id(), user.email(), "patient", "payment.invoice_downloaded", "payment", paymentId, Map.of());
		return new Rendered("invoice-" + reference + ".pdf", pdf);
	}

	public record Rendered(String fileName, byte[] content) {
	}

}
