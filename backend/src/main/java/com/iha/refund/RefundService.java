package com.iha.refund;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.text.NumberFormat;
import java.time.Instant;
import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.cases.CaseRepository;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.doctor.DoctorFeePayment;
import com.iha.doctor.DoctorFeePaymentRepository;
import com.iha.fees.FeeSettingsService;
import com.iha.notification.NotificationService;
import com.iha.patient.PatientRepository;
import com.iha.payment.Payment;
import com.iha.payment.PaymentGateway;
import com.iha.payment.PaymentRepository;
import com.iha.payment.RefundStatusEvent;
import com.iha.provider.DoctorRepository;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Full and partial refunds by MTA admin, of patient payments (treatment,
 * consultation) and doctor fees (registration, annual). The card processing
 * fee is deducted from refunds, at most once per payment in total, unless the
 * admin waives it: with Stripe it is the fee Stripe actually kept, otherwise an
 * estimate from the fee settings. Refunds go back to the original card.
 */
@Service
public class RefundService {

	public static final String PATIENT = "patient";
	public static final String DOCTOR = "doctor";

	/** Reason codes and their labels (shown to admin and in the patient's notification). */
	public static final Map<String, String> REASONS = new LinkedHashMap<>();

	static {
		REASONS.put("doctor_cancelled", "Doctor cancelled or missed the consultation");
		REASONS.put("visa_refused", "Visa refused");
		REASONS.put("treatment_not_possible", "Treatment not possible or cancelled");
		REASONS.put("duplicate", "Duplicate or mistaken payment");
		REASONS.put("goodwill", "Goodwill gesture");
		REASONS.put("other", "Other");
	}

	private final PaymentRepository payments;
	private final DoctorFeePaymentRepository feePayments;
	private final PaymentRefundRepository refunds;
	private final PaymentGateway gateway;
	private final FeeSettingsService fees;
	private final PatientRepository patients;
	private final DoctorRepository doctors;
	private final CaseRepository cases;
	private final NotificationService notifications;
	private final AuditService audit;
	private final ApplicationEventPublisher events;

	RefundService(PaymentRepository payments, DoctorFeePaymentRepository feePayments, PaymentRefundRepository refunds,
			PaymentGateway gateway, FeeSettingsService fees, PatientRepository patients, DoctorRepository doctors,
			CaseRepository cases, NotificationService notifications, AuditService audit,
			ApplicationEventPublisher events) {
		this.payments = payments;
		this.feePayments = feePayments;
		this.refunds = refunds;
		this.gateway = gateway;
		this.fees = fees;
		this.patients = patients;
		this.doctors = doctors;
		this.cases = cases;
		this.notifications = notifications;
		this.audit = audit;
		this.events = events;
	}

	/** What can still be refunded on a payment, and the fee that would be deducted. */
	@Transactional(readOnly = true)
	public Quote quote(String kind, UUID paymentId) {
		return quote(target(kind, paymentId));
	}

	/** Refunds per payment (failed ones left out), for payment histories. */
	@Transactional(readOnly = true)
	public Map<UUID, List<PaymentRefund>> refundsByPayment(Collection<UUID> paymentIds) {
		return paymentIds.isEmpty() ? Map.of()
				: refunds.findByPaymentIdIn(paymentIds).stream()
					.filter(PaymentRefund::counts)
					.sorted(Comparator.comparing(PaymentRefund::getCreatedAt))
					.collect(Collectors.groupingBy(PaymentRefund::getPaymentId));
	}

	@Transactional(readOnly = true)
	public List<PaymentRefund> refundsFor(UUID paymentId) {
		return refunds.findByPaymentIdOrderByCreatedAtAsc(paymentId);
	}

	@Transactional
	public PaymentRefund refund(CurrentUser actor, String kind, UUID paymentId, BigDecimal amount, String reason,
			String note, boolean waiveFee) {
		Target t = target(kind, paymentId);
		if (!REASONS.containsKey(reason)) {
			throw ApiException.badRequest("invalid_reason", "Choose a reason for the refund.");
		}
		String cleanNote = note == null || note.isBlank() ? null : note.trim();
		if ("other".equals(reason) && (cleanNote == null || cleanNote.length() < 5)) {
			throw ApiException.badRequest("note_required", "Describe the reason (min. 5 characters).");
		}
		if (t.paidAt() == null) {
			throw ApiException.conflict("not_paid", "Only completed payments can be refunded.");
		}
		if (t.intentId() == null || !gateway.name().equals(t.gateway())) {
			throw ApiException.conflict("refund_not_possible",
					"This payment was taken by another payment provider and can't be refunded from here.");
		}
		Quote q = quote(t);
		if (amount == null || amount.signum() <= 0 || amount.stripTrailingZeros().scale() > 2) {
			throw ApiException.badRequest("invalid_amount", "Enter an amount above 0, with at most 2 decimals.");
		}
		if (amount.compareTo(q.refundableAud()) > 0) {
			throw ApiException.badRequest("amount_too_high",
					"At most " + aud(q.refundableAud()) + " of this payment can still be refunded.");
		}
		BigDecimal deduct = waiveFee ? BigDecimal.ZERO : q.feeRemainingAud().min(amount);
		String feeSource = waiveFee ? "waived" : deduct.signum() == 0 ? "none" : q.feeSource();
		if (amount.subtract(deduct).signum() <= 0) {
			throw ApiException.badRequest("refund_below_fee",
					"After the card processing fee of " + aud(deduct) + " there is nothing left to refund.");
		}
		PaymentRefund refund = refunds.save(new PaymentRefund(kind, paymentId, t.caseId(), amount.setScale(2),
				deduct.setScale(2, RoundingMode.HALF_UP), feeSource, reason, cleanNote, gateway.name(), actor.email()));
		PaymentGateway.Refund result = gateway.refund(t.intentId(), cents(refund.getRefundedAud()),
				Map.of("refund_id", refund.getId().toString(), "payment_kind", kind, "payment_id", paymentId.toString()));
		refund.update(result.id(), result.status());
		audit.record(actor.id(), actor.email(), "admin", "payment.refunded", kind + "_payment", paymentId,
				Map.of("refund_id", refund.getId().toString(), "amount", refund.getAmountAud().toPlainString(),
						"fee_deducted", refund.getFeeDeductedAud().toPlainString(), "reason", reason,
						"status", refund.getStatus()));
		if (!refund.counts()) {
			return refund;
		}
		boolean full = settle(t);
		notifyPayer(t, refund);
		events.publishEvent(new PaymentRefundedEvent(kind, paymentId, t.caseId(), t.consultationRequestId(), t.type(),
				full, REASONS.get(reason)));
		return refund;
	}

	/** Provider webhook: a pending refund succeeded or failed. */
	@EventListener
	@Transactional
	public void onRefundStatus(RefundStatusEvent event) {
		refunds.findByGatewayRefundId(event.gatewayRefundId()).ifPresent(refund -> {
			if (refund.getStatus().equals(event.status())) {
				return;
			}
			refund.update(null, event.status());
			settle(target(refund.getPaymentKind(), refund.getPaymentId()));
			audit.record(null, null, "system", "payment.refund_" + event.status(), refund.getPaymentKind() + "_payment",
					refund.getPaymentId(), Map.of("refund_id", refund.getId().toString()));
		});
	}

	// ── Helpers ─────────────────────────────────────────────────────────────

	private Quote quote(Target t) {
		List<PaymentRefund> previous = refunds.findByPaymentIdOrderByCreatedAtAsc(t.id()).stream()
			.filter(PaymentRefund::counts)
			.toList();
		BigDecimal refundedGross = sum(previous.stream().map(PaymentRefund::getAmountAud).toList());
		BigDecimal refundedNet = sum(previous.stream().map(PaymentRefund::getRefundedAud).toList());
		BigDecimal deducted = sum(previous.stream().map(PaymentRefund::getFeeDeductedAud).toList());
		Long providerFee = t.intentId() == null || !gateway.name().equals(t.gateway()) ? null
				: gateway.processingFeeCents(t.intentId());
		BigDecimal fee;
		String source;
		if (providerFee != null) {
			fee = BigDecimal.valueOf(providerFee).movePointLeft(2);
			source = "stripe";
		}
		else {
			fee = t.amount()
				.multiply(fees.amount(FeeSettingsService.CARD_FEE_PCT))
				.movePointLeft(2)
				.add(fees.amount(FeeSettingsService.CARD_FEE_FIXED_AUD))
				.setScale(2, RoundingMode.HALF_UP);
			source = "estimate";
		}
		BigDecimal feeRemaining = fee.subtract(deducted).max(BigDecimal.ZERO);
		BigDecimal refundable = t.amount().subtract(refundedGross).max(BigDecimal.ZERO);
		return new Quote(t.amount(), refundedGross, refundedNet, refundable, fee, source, deducted, feeRemaining);
	}

	/** Marks the payment refunded once nothing is left; returns whether it is fully refunded. */
	private boolean settle(Target t) {
		BigDecimal refunded = sum(refunds.findByPaymentIdOrderByCreatedAtAsc(t.id()).stream()
			.filter(PaymentRefund::counts)
			.map(PaymentRefund::getAmountAud)
			.toList());
		boolean full = refunded.compareTo(t.amount()) >= 0;
		if (PATIENT.equals(t.kind())) {
			payments.findById(t.id()).ifPresent(p -> p.setRefunded(full));
		}
		else {
			feePayments.findById(t.id()).ifPresent(p -> p.setRefunded(full));
		}
		return full;
	}

	private void notifyPayer(Target t, PaymentRefund refund) {
		String fee = refund.getFeeDeductedAud().signum() > 0
				? " A card processing fee of " + aud(refund.getFeeDeductedAud()) + " was deducted." : "";
		String timing = " Refunds usually reach your card within 5–10 business days.";
		String title = "Refund of " + aud(refund.getRefundedAud()) + " issued";
		if (PATIENT.equals(t.kind())) {
			patients.findById(t.payerId()).ifPresent(p -> {
				if (p.getUserId() == null) {
					return;
				}
				String ref = t.caseId() == null ? "" : cases.findById(t.caseId())
					.map(MedicalCase::getReferenceNumber)
					.map(r -> " (case " + r + ")")
					.orElse("");
				notifications.notifyWithAlert(p.getUserId(), "refund_issued", title, "MTA has refunded "
						+ aud(refund.getRefundedAud()) + " of your " + t.label() + ref + "." + fee + timing, t.caseId());
			});
		}
		else {
			doctors.findById(t.payerId()).ifPresent(d -> {
				if (d.getUserId() != null) {
					notifications.notifyWithAlert(d.getUserId(), "refund_issued", title, "MTA has refunded "
							+ aud(refund.getRefundedAud()) + " of your " + t.label() + "." + fee + timing, null);
				}
			});
		}
	}

	private Target target(String kind, UUID id) {
		if (PATIENT.equals(kind)) {
			Payment p = payments.findById(id).orElseThrow(() -> ApiException.notFound("Payment not found."));
			return new Target(kind, p.getId(), p.getPatientId(), p.getCaseId(), p.getConsultationRequestId(),
					p.getPaymentType(), Payment.CONSULTATION_FEE.equals(p.getPaymentType()) ? "consultation fee"
							: "treatment payment",
					p.getAmountAud(), p.getPaymentIntentId(), p.getGateway(), p.getPaidAt());
		}
		if (DOCTOR.equals(kind)) {
			DoctorFeePayment p = feePayments.findById(id).orElseThrow(() -> ApiException.notFound("Payment not found."));
			return new Target(kind, p.getId(), p.getDoctorId(), null, null, p.getFeeType(),
					DoctorFeePayment.REGISTRATION.equals(p.getFeeType()) ? "registration fee" : "annual membership fee",
					p.getAmountAud(), p.getPaymentIntentId(), p.getGateway(), p.getPaidAt());
		}
		throw ApiException.notFound("Payment not found.");
	}

	private static BigDecimal sum(List<BigDecimal> values) {
		return values.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
	}

	private static long cents(BigDecimal aud) {
		return aud.movePointRight(2).setScale(0, RoundingMode.HALF_UP).longValueExact();
	}

	static String aud(BigDecimal amount) {
		NumberFormat format = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("en-AU"));
		return "A" + format.format(amount);
	}

	/** {@code payerId}: the patient or doctor id. */
	private record Target(String kind, UUID id, UUID payerId, UUID caseId, UUID consultationRequestId, String type,
			String label, BigDecimal amount, String intentId, String gateway, Instant paidAt) {
	}

	/**
	 * @param refundableAud what can still be refunded (before the fee deduction)
	 * @param feeAud the card processing fee on the payment
	 * @param feeSource stripe (real fee) or estimate (fee settings)
	 * @param feeRemainingAud what may still be deducted
	 */
	public record Quote(BigDecimal amountAud, BigDecimal refundedAud, BigDecimal refundedToCardAud,
			BigDecimal refundableAud, BigDecimal feeAud, String feeSource, BigDecimal feeDeductedAud,
			BigDecimal feeRemainingAud) {
	}

}
