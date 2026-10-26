package com.iha.payment;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.cases.CaseRepository;
import com.iha.cases.MedicalCase;
import com.iha.fees.BusinessSettingsService;
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
	private final BusinessSettingsService business;

	InvoiceService(PaymentService payments, PatientService patientService, CaseRepository cases,
			TreatmentOptionRepository options, TreatmentOptionViews optionViews, InvoiceRenderer renderer,
			AuditService audit, BusinessSettingsService business) {
		this.payments = payments;
		this.patientService = patientService;
		this.cases = cases;
		this.options = options;
		this.optionViews = optionViews;
		this.renderer = renderer;
		this.audit = audit;
		this.business = business;
	}

	@Transactional(readOnly = true)
	public Rendered invoice(CurrentUser user, UUID paymentId) {
		Payment payment = payments.requireOwned(user, paymentId);
		if (payment.getPaidAt() == null) {
			throw ApiException.conflict("payment_not_completed", "An invoice is available once the payment completes.");
		}
		String reference = cases.findById(payment.getCaseId()).map(MedicalCase::getReferenceNumber).orElse("");
		String hospital = payment.getTreatmentOptionId() == null ? null
				: options.findById(payment.getTreatmentOptionId())
					.map(optionViews::build)
					.map(o -> o.hospital() != null ? o.hospital().name() : null)
					.orElse(null);
		List<InvoiceRenderer.Line> lines = lines(payment);
		byte[] pdf = renderer.render(new InvoiceRenderer.Invoice(reference + "-" + payment.getId().toString().substring(0, 6).toUpperCase(),
				payment.getPaidAt(), "Case", reference, payment.getGatewayReference(),
				patientService.requireCurrent(user).getFullName(), user.email(), hospital, lines, payment.getAmountAud()));
		audit.record(user.id(), user.email(), "patient", "payment.invoice_downloaded", "payment", paymentId, Map.of());
		return new Rendered("invoice-" + reference + ".pdf", pdf);
	}

	/**
	 * The invoice lines of a patient payment, each with the GST it includes: MTA's
	 * service fee and the treatment costs are classified separately (see
	 * {@link BusinessSettingsService}); a consultation is one line.
	 */
	@Transactional(readOnly = true)
	public List<InvoiceRenderer.Line> lines(Payment payment) {
		if (Payment.FULL_PAYMENT.equals(payment.getPaymentType()) && payment.getTreatmentOptionId() != null) {
			TreatmentOptionViews.OptionView option = options.findById(payment.getTreatmentOptionId())
				.map(optionViews::build)
				.orElseThrow();
			return option.costBreakdown().items().stream()
				.map(i -> new InvoiceRenderer.Line(i.label(), i.amount(),
						business.gstIn("iha_service_fee".equals(i.labelKey())
								? BusinessSettingsService.Charge.MTA_SERVICE_FEE
								: BusinessSettingsService.Charge.TREATMENT_COSTS, i.amount())))
				.toList();
		}
		return List.of(new InvoiceRenderer.Line("Online consultation fee", payment.getAmountAud(),
				business.gstIn(BusinessSettingsService.Charge.CONSULTATION_FEE, payment.getAmountAud())));
	}

	/** The share of a payment that is GST (0 when none), for credit notes on partial refunds. */
	@Transactional(readOnly = true)
	public BigDecimal gstShare(Payment payment) {
		BigDecimal gst = lines(payment).stream()
			.map(InvoiceRenderer.Line::gst)
			.filter(java.util.Objects::nonNull)
			.reduce(BigDecimal.ZERO, BigDecimal::add);
		return payment.getAmountAud().signum() == 0 ? BigDecimal.ZERO
				: gst.divide(payment.getAmountAud(), 8, java.math.RoundingMode.HALF_UP);
	}

	public record Rendered(String fileName, byte[] content) {
	}

}
