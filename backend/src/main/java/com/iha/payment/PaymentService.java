package com.iha.payment;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.cases.CaseService;
import com.iha.cases.CaseStatus;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.consultation.ConsultationRequest;
import com.iha.consultation.ConsultationRequestRepository;
import com.iha.consultation.ConsultationService;
import com.iha.consultation.ConsultationSlotSelectedEvent;
import com.iha.patient.Patient;
import com.iha.patient.PatientService;
import com.iha.treatment.TreatmentOptionRepository;
import com.iha.treatment.TreatmentOptionSelectedEvent;
import com.iha.treatment.TreatmentOptionViews;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Patient payments (ported from {@code /api/payments/*} and {@code @iha/db/payments}).
 * A pending row is created when the patient commits (option or slot selected);
 * checkout attaches a provider intent to it; the provider's success callback
 * completes it and publishes {@link PaymentCompletedEvent}.
 */
@Service
public class PaymentService {

	private final PaymentRepository payments;
	private final PaymentMethodRepository methods;
	private final PaymentGateway gateway;
	private final PatientService patientService;
	private final CaseService caseService;
	private final TreatmentOptionRepository options;
	private final TreatmentOptionViews optionViews;
	private final ConsultationRequestRepository consultations;
	private final AuditService audit;
	private final ApplicationEventPublisher events;

	PaymentService(PaymentRepository payments, PaymentMethodRepository methods, PaymentGateway gateway,
			PatientService patientService, CaseService caseService, TreatmentOptionRepository options,
			TreatmentOptionViews optionViews, ConsultationRequestRepository consultations, AuditService audit,
			ApplicationEventPublisher events) {
		this.payments = payments;
		this.methods = methods;
		this.gateway = gateway;
		this.patientService = patientService;
		this.caseService = caseService;
		this.options = options;
		this.optionViews = optionViews;
		this.consultations = consultations;
		this.audit = audit;
		this.events = events;
	}

	public String provider() {
		return gateway.name();
	}

	public String publishableKey() {
		return gateway.publishableKey();
	}

	@EventListener
	void onOptionSelected(TreatmentOptionSelectedEvent event) {
		if (payments.findFirstByCaseIdAndPaymentTypeAndStatus(event.caseId(), Payment.FULL_PAYMENT, Payment.PENDING)
			.isEmpty()) {
			payments.save(Payment.pendingTreatment(event.caseId(), event.patientId(), event.treatmentOptionId(),
					event.amountAud(), gateway.name()));
		}
	}

	@EventListener
	void onSlotSelected(ConsultationSlotSelectedEvent event) {
		if (payments.findFirstByConsultationRequestIdAndStatus(event.consultationRequestId(), Payment.PENDING)
			.isEmpty()) {
			payments.save(Payment.pendingConsultation(event.caseId(), event.patientId(), event.consultationRequestId(),
					event.amountAud(), gateway.name()));
		}
	}

	/** Old {@code POST /api/payments/create-intent}. */
	@Transactional
	public Checkout startTreatmentCheckout(CurrentUser user, UUID caseId) {
		Patient patient = patientService.requireCurrent(user);
		MedicalCase medicalCase = caseService.requireOwned(patient, caseId);
		if (payments.existsByCaseIdAndPaymentTypeAndStatus(caseId, Payment.FULL_PAYMENT, Payment.COMPLETED)) {
			throw ApiException.conflict("already_paid", "This treatment has already been paid.");
		}
		if (medicalCase.getStatus() != CaseStatus.TREATMENT_CONFIRMED) {
			throw ApiException.conflict("invalid_status", "This case isn't awaiting payment.");
		}
		Payment payment = payments.findFirstByCaseIdAndPaymentTypeAndStatus(caseId, Payment.FULL_PAYMENT, Payment.PENDING)
			.orElseGet(() -> {
				// A previous attempt failed: start a fresh pending payment for the selected option.
				var option = options.findFirstByCaseIdAndSelectedTrue(caseId)
					.orElseThrow(() -> ApiException.conflict("no_selected_option", "No treatment option is selected."));
				return payments.save(Payment.pendingTreatment(caseId, patient.getId(), option.getId(),
						optionViews.build(option).costBreakdown().total(), gateway.name()));
			});
		return checkout(user, patient, payment, Map.of("case_id", caseId.toString(), "treatment_option_id",
				String.valueOf(payment.getTreatmentOptionId()), "reference_number", medicalCase.getReferenceNumber()),
				"Treatment payment — case " + medicalCase.getReferenceNumber());
	}

	/** Old {@code POST /api/payments/consultation-intent}. */
	@Transactional
	public Checkout startConsultationCheckout(CurrentUser user, UUID requestId) {
		Patient patient = patientService.requireCurrent(user);
		ConsultationRequest request = consultations.findByIdAndPatientId(requestId, patient.getId())
			.orElseThrow(() -> ApiException.notFound("Consultation request not found."));
		if (!ConsultationRequest.SLOT_SELECTED.equals(request.getStatus())) {
			throw ApiException.conflict("invalid_status", "This consultation isn't awaiting payment.");
		}
		Payment payment = payments.findFirstByConsultationRequestIdAndStatus(requestId, Payment.PENDING)
			.orElseGet(() -> payments.save(Payment.pendingConsultation(request.getCaseId(), patient.getId(), requestId,
					ConsultationService.CONSULTATION_FEE_AUD, gateway.name())));
		return checkout(user, patient, payment, Map.of("consultation_request_id", requestId.toString(), "case_id",
				request.getCaseId().toString()), "Online consultation fee");
	}

	private Checkout checkout(CurrentUser user, Patient patient, Payment payment, Map<String, String> metadata,
			String description) {
		String customerId = gateway.ensureCustomer(patient.getStripeCustomerId(), user.email(), patient.getFullName(),
				Map.of("patient_id", patient.getId().toString()));
		patient.setStripeCustomerId(customerId);
		String defaultMethod = methods.findFirstByUserIdAndDefaultMethodTrue(user.id())
			.map(PaymentMethod::getProviderMethodId)
			.orElse(null);
		Map<String, String> fullMetadata = new HashMap<>(metadata);
		fullMetadata.put("patient_id", patient.getId().toString());
		fullMetadata.put("payment_id", payment.getId().toString());
		PaymentGateway.Intent intent = gateway.createOrReuseIntent(payment.getPaymentIntentId(),
				toCents(payment.getAmountAud()), customerId, defaultMethod, fullMetadata, description);
		if (!intent.id().equals(payment.getPaymentIntentId())) {
			payment.attachIntent(intent.id());
			audit.record(user.id(), user.email(), "patient", "payment.intent_created", "payment", payment.getId(),
					Map.of("payment_type", payment.getPaymentType()));
		}
		return new Checkout(gateway.name(), gateway.publishableKey(), payment.getId(), intent.id(),
				intent.clientSecret(), gateway.customerSessionSecret(customerId), payment.getAmountAud(), defaultMethod);
	}

	/** Called by the provider webhook (or the simulator). Idempotent: replays are ignored. */
	@Transactional
	public void complete(String intentId, String chargeReference) {
		if (payments.findByPaymentIntentId(intentId).isEmpty()) {
			events.publishEvent(new UnmatchedIntentEvent(intentId, chargeReference, true));
			return;
		}
		payments.findByPaymentIntentId(intentId).filter(Payment::isPending).ifPresent(payment -> {
			payment.complete(chargeReference != null ? chargeReference : intentId);
			events.publishEvent(new PaymentCompletedEvent(payment.getId(), payment.getPaymentType(),
					payment.getCaseId(), payment.getTreatmentOptionId(), payment.getConsultationRequestId()));
			audit.record(null, null, "patient", Payment.CONSULTATION_FEE.equals(payment.getPaymentType())
					? "consultation.payment_completed" : "payment.completed", "payment", payment.getId(),
					Map.of("amount_aud", payment.getAmountAud().toPlainString()));
		});
	}

	@Transactional
	public void fail(String intentId) {
		if (payments.findByPaymentIntentId(intentId).isEmpty()) {
			events.publishEvent(new UnmatchedIntentEvent(intentId, null, false));
			return;
		}
		payments.findByPaymentIntentId(intentId).filter(Payment::isPending).ifPresent(Payment::fail);
	}

	/** The simulated provider's "pay" button. Only the payment's owner may trigger it. */
	@Transactional
	public void simulateSuccess(CurrentUser user, String intentId) {
		if (!FakePaymentGateway.NAME.equals(gateway.name())) {
			throw ApiException.notFound("Not found.");
		}
		Patient patient = patientService.requireCurrent(user);
		Payment payment = payments.findByPaymentIntentId(intentId)
			.filter(p -> p.getPatientId().equals(patient.getId()))
			.orElseThrow(() -> ApiException.notFound("Payment not found."));
		complete(payment.getPaymentIntentId(), "SIM-" + payment.getId().toString().substring(0, 8).toUpperCase());
	}

	@Transactional
	public void handleWebhook(String payload, String signature) {
		PaymentGateway.WebhookEvent event = gateway.parseWebhook(payload, signature);
		if (event.intentId() == null) {
			return;
		}
		switch (event.type()) {
			case PaymentGateway.WebhookEvent.SUCCEEDED -> complete(event.intentId(), event.chargeReference());
			case PaymentGateway.WebhookEvent.FAILED -> fail(event.intentId());
			default -> {
				// Other event types are acknowledged and ignored.
			}
		}
	}

	@Transactional(readOnly = true)
	public List<Payment> history(CurrentUser user) {
		return payments.findByPatientIdOrderByCreatedAtDesc(patientService.requireCurrent(user).getId());
	}

	@Transactional(readOnly = true)
	public List<Payment> forCases(List<UUID> caseIds) {
		return caseIds.isEmpty() ? List.of() : payments.findByCaseIdInOrderByCreatedAtDesc(caseIds);
	}

	@Transactional(readOnly = true)
	public Payment requireOwned(CurrentUser user, UUID paymentId) {
		return payments.findByIdAndPatientId(paymentId, patientService.requireCurrent(user).getId())
			.orElseThrow(() -> ApiException.notFound("Payment not found."));
	}

	// ── Saved cards ─────────────────────────────────────────────────────────

	@Transactional(readOnly = true)
	public List<PaymentMethod> cards(CurrentUser user) {
		return methods.findByUserIdOrderByCreatedAtDesc(user.id());
	}

	/** The card was created in the browser with the provider's SDK; attach it to the customer. */
	@Transactional
	public PaymentMethod addCard(CurrentUser user, String providerMethodId) {
		Patient patient = patientService.requireCurrent(user);
		String customerId = gateway.ensureCustomer(patient.getStripeCustomerId(), user.email(), patient.getFullName(),
				Map.of("patient_id", patient.getId().toString()));
		patient.setStripeCustomerId(customerId);
		PaymentGateway.Card card = gateway.attachCard(customerId, providerMethodId);
		boolean first = methods.findByUserIdOrderByCreatedAtDesc(user.id()).isEmpty();
		if (first) {
			gateway.setDefaultCard(customerId, card.paymentMethodId());
		}
		PaymentMethod saved = methods.save(new PaymentMethod(user.id(), card, first));
		audit.record(user.id(), user.email(), "patient", "payment.method_added", "payment_method", saved.getId(),
				Map.of("brand", card.brand(), "last4", card.last4()));
		return saved;
	}

	@Transactional
	public void setDefaultCard(CurrentUser user, UUID methodId) {
		Patient patient = patientService.requireCurrent(user);
		PaymentMethod chosen = methods.findByIdAndUserId(methodId, user.id())
			.orElseThrow(() -> ApiException.notFound("Card not found."));
		gateway.setDefaultCard(patient.getStripeCustomerId(), chosen.getProviderMethodId());
		methods.findByUserIdOrderByCreatedAtDesc(user.id()).forEach(m -> m.setDefault(m.getId().equals(methodId)));
		audit.record(user.id(), user.email(), "patient", "payment.method_set_default", "payment_method", methodId,
				Map.of());
	}

	@Transactional
	public void removeCard(CurrentUser user, UUID methodId) {
		Patient patient = patientService.requireCurrent(user);
		PaymentMethod method = methods.findByIdAndUserId(methodId, user.id())
			.orElseThrow(() -> ApiException.notFound("Card not found."));
		gateway.detachCard(method.getProviderMethodId());
		methods.delete(method);
		methods.flush();
		if (method.isDefaultMethod()) {
			methods.findByUserIdOrderByCreatedAtDesc(user.id()).stream().findFirst().ifPresent(next -> {
				next.setDefault(true);
				gateway.setDefaultCard(patient.getStripeCustomerId(), next.getProviderMethodId());
			});
		}
		audit.record(user.id(), user.email(), "patient", "payment.method_removed", "payment_method", methodId,
				Map.of());
	}

	static long toCents(BigDecimal amountAud) {
		return amountAud.movePointRight(2).setScale(0, RoundingMode.HALF_UP).longValueExact();
	}

	public record Checkout(String provider, String publishableKey, UUID paymentId, String intentId,
			String clientSecret, String customerSessionClientSecret, BigDecimal amountAud,
			String defaultPaymentMethodId) {
	}

}
