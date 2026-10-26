package com.iha.consultation;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.cases.CaseRepository;
import com.iha.cases.CaseService;
import com.iha.cases.CaseStatus;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.common.AustralianTimeZones;
import com.iha.notification.NotificationService;
import com.iha.patient.Patient;
import com.iha.patient.PatientRepository;
import com.iha.patient.PatientService;
import com.iha.fees.FeeSettingsService;
import com.iha.payment.Payment;
import com.iha.payment.PaymentCompletedEvent;
import com.iha.payment.PaymentRepository;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorRepository;
import com.iha.refund.PaymentRefundedEvent;
import com.iha.treatment.PatientTreatmentService;
import com.iha.treatment.TreatmentOption;
import com.iha.treatment.TreatmentOptionRepository;
import com.iha.treatment.TreatmentPlan;
import com.iha.treatment.TreatmentPlanRepository;
import com.iha.zoom.ZoomClient;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Online consultations (ported from {@code request_online_consultation},
 * {@code select_consultation_slot}, the payment webhook's scheduling step and
 * the {@code notify_consultation_status_change} / {@code notify_doctor_on_consultation_request} triggers).
 */
@Service
public class ConsultationService {

	private static final Logger log = LoggerFactory.getLogger(ConsultationService.class);
	private static final Set<String> AWAITING_SLOT = Set.of(ConsultationRequest.SLOTS_PROPOSED,
			ConsultationRequest.SLOT_SELECTED);

	private final ConsultationRequestRepository requests;
	private final ConsultationSlotRepository slots;
	private final PatientService patientService;
	private final PatientRepository patients;
	private final CaseService caseService;
	private final CaseRepository cases;
	private final PatientTreatmentService treatments;
	private final TreatmentOptionRepository options;
	private final TreatmentPlanRepository plans;
	private final DoctorRepository doctors;
	private final NotificationService notifications;
	private final ZoomClient zoom;
	private final AuditService audit;
	private final ApplicationEventPublisher events;
	private final FeeSettingsService fees;
	private final PaymentRepository payments;

	ConsultationService(ConsultationRequestRepository requests, ConsultationSlotRepository slots,
			PatientService patientService, PatientRepository patients, CaseService caseService, CaseRepository cases,
			PatientTreatmentService treatments, TreatmentOptionRepository options, TreatmentPlanRepository plans,
			DoctorRepository doctors, NotificationService notifications, ZoomClient zoom, AuditService audit,
			ApplicationEventPublisher events, FeeSettingsService fees, PaymentRepository payments) {
		this.requests = requests;
		this.slots = slots;
		this.patientService = patientService;
		this.patients = patients;
		this.caseService = caseService;
		this.cases = cases;
		this.treatments = treatments;
		this.options = options;
		this.plans = plans;
		this.doctors = doctors;
		this.notifications = notifications;
		this.zoom = zoom;
		this.audit = audit;
		this.events = events;
		this.fees = fees;
		this.payments = payments;
	}

	@Transactional(readOnly = true)
	public List<RequestView> forCase(CurrentUser user, UUID caseId) {
		MedicalCase medicalCase = caseService.requireOwned(patientService.requireCurrent(user), caseId);
		return withSlots(requests.findByCaseIdOrderByRequestedAtAsc(medicalCase.getId()));
	}

	@Transactional(readOnly = true)
	public List<RequestView> forPatient(CurrentUser user) {
		return withSlots(requests.findByPatientIdOrderByRequestedAtAsc(patientService.requireCurrent(user).getId()));
	}

	@Transactional(readOnly = true)
	public RequestView get(CurrentUser user, UUID requestId) {
		return withSlots(List.of(requireOwned(patientService.requireCurrent(user), requestId))).get(0);
	}

	@Transactional
	public RequestView request(CurrentUser user, UUID optionId) {
		Patient patient = patientService.requireCurrent(user);
		TreatmentOption option = treatments.requireOwnedOption(patient, optionId);
		MedicalCase medicalCase = caseService.requireOwned(patient, option.getCaseId());
		if (medicalCase.getStatus() != CaseStatus.TREATMENT_PLAN) {
			throw ApiException.conflict("case_not_in_treatment_plan_status",
					"Consultations can only be requested while you are reviewing treatment options.");
		}
		if (requests.existsByTreatmentOptionId(optionId)) {
			throw ApiException.conflict("consultation_already_requested",
					"A consultation has already been requested for this option.");
		}
		ConsultationRequest request = requests.save(new ConsultationRequest(medicalCase.getId(), patient.getId(), optionId));

		notifications.notify(user.id(), "consultation_requested", "Online consultation requested",
				"Your online consultation request for case %s has been sent to the doctor."
					.formatted(medicalCase.getReferenceNumber()),
				medicalCase.getId());
		doctorFor(option).filter(d -> d.getUserId() != null).ifPresent(doctor -> {
			TreatmentPlan plan = plans.findById(option.getTreatmentPlanId()).orElseThrow();
			notifications.notifyWithAlert(doctor.getUserId(), "consultation_request_received",
					"New consultation request",
					"%s requested an online consultation for %s (Case %s).".formatted(patient.getFullName(),
							plan.getProcedureName() != null ? plan.getProcedureName() : "a treatment option",
							medicalCase.getReferenceNumber()),
					medicalCase.getId());
		});
		audit.record(user.id(), user.email(), "patient", "consultation.requested", "consultation_request",
				request.getId(), Map.of("treatment_option_id", optionId.toString()));
		return withSlots(List.of(request)).get(0);
	}

	@Transactional
	public RequestView selectSlot(CurrentUser user, UUID requestId, UUID slotId) {
		Patient patient = patientService.requireCurrent(user);
		ConsultationRequest request = requireOwned(patient, requestId);
		if (!AWAITING_SLOT.contains(request.getStatus())) {
			throw ApiException.conflict("consultation_not_awaiting_slot_selection",
					"This consultation isn't waiting for a time to be chosen.");
		}
		slots.findByIdAndConsultationRequestId(slotId, requestId)
			.orElseThrow(() -> ApiException.notFound("Slot not found."));
		String previous = request.getStatus();
		request.selectSlot(slotId);
		statusChanged(request, previous, true);
		events.publishEvent(new ConsultationSlotSelectedEvent(request.getCaseId(), patient.getId(), request.getId(),
				fees.consultationFeeAud()));
		audit.record(user.id(), user.email(), "patient", "consultation.slot_selected", "consultation_request",
				request.getId(), Map.of("slot_id", slotId.toString()));
		return withSlots(List.of(request)).get(0);
	}

	/** Old webhook {@code handleConsultationPaymentSucceeded}: slot_selected → scheduled, with a Zoom meeting. */
	/** A fully refunded consultation that hasn't taken place is cancelled; patient and doctor are told. */
	@EventListener
	void onPaymentRefunded(PaymentRefundedEvent event) {
		if (!event.fullyRefunded() || event.consultationRequestId() == null) {
			return;
		}
		requests.findById(event.consultationRequestId()).ifPresent(request -> {
			if (ConsultationRequest.CANCELLED.equals(request.getStatus())) {
				return;
			}
			Instant start = request.getSelectedSlotId() == null ? null
					: slots.findById(request.getSelectedSlotId()).map(ConsultationSlot::getSlotTime).orElse(null);
			if (request.hasTakenPlace(start)) {
				return;
			}
			String previous = request.getStatus();
			request.cancel("Refunded by MTA: " + event.reasonLabel());
			requests.saveAndFlush(request);
			statusChanged(request, previous, true);
			doctorOf(request).filter(d -> d.getUserId() != null).ifPresent(d -> {
				String ref = cases.findById(request.getCaseId()).map(MedicalCase::getReferenceNumber).orElse("a case");
				notifications.notifyWithAlert(d.getUserId(), "consultation_cancelled", "Consultation cancelled by MTA",
						"MTA refunded the patient's consultation fee for case " + ref + " (" + event.reasonLabel()
								+ "), so the consultation is cancelled.",
						request.getCaseId());
			});
		});
	}

	@EventListener
	void onPaymentCompleted(PaymentCompletedEvent event) {
		if (event.consultationRequestId() == null) {
			return;
		}
		requests.findById(event.consultationRequestId())
			.filter(r -> ConsultationRequest.SLOT_SELECTED.equals(r.getStatus()))
			.ifPresent(request -> {
				ConsultationSlot slot = slots.findById(request.getSelectedSlotId()).orElseThrow();
				String reference = cases.findById(request.getCaseId()).map(MedicalCase::getReferenceNumber).orElse("");
				String joinUrl = null;
				try {
					joinUrl = zoom.createMeeting("MTA consultation — case " + reference, slot.getSlotTime(),
							Duration.between(slot.getSlotTime(), slot.getSlotEndTime()),
							doctorOf(request).map(Doctor::getTimeZone).orElse(AustralianTimeZones.DEFAULT));
				}
				catch (RuntimeException ex) {
					// Payment already succeeded; the coordinator can add the link manually.
					log.error("Zoom meeting creation failed for consultation {}", request.getId(), ex);
				}
				request.schedule(joinUrl);
				statusChanged(request, ConsultationRequest.SLOT_SELECTED, true);
				audit.record(null, null, "patient", "consultation.scheduled", "consultation_request", request.getId(),
						Map.of("zoom_link_created", joinUrl != null));
			});
	}

	/** Patient notification for a status change, with the old trigger's wording. Public for the doctor portal port. */
	public void statusChanged(ConsultationRequest request, String previousStatus, boolean alert) {
		patients.findById(request.getPatientId()).ifPresent(patient -> {
			String ref = cases.findById(request.getCaseId()).map(MedicalCase::getReferenceNumber).orElse("your case");
			String doctorName = doctorOf(request).map(Doctor::getFullName).orElse(null);
			String doctorRef = doctorName != null ? withTitle(doctorName) : "your doctor";
			String doctorStart = doctorName != null ? withTitle(doctorName) : "Your doctor";
			String title;
			String message;
			if (request.isInitial()) {
				Text text = initialText(request, previousStatus, ref, doctorStart, doctorRef);
				title = text.title();
				message = text.message();
			}
			else if (request.getStatus().equals(previousStatus)) {
				title = "Consultation times updated";
				message = doctorStart + " has updated the proposed consultation times for case " + ref
						+ ". Please select a slot.";
			}
			else {
				switch (request.getStatus()) {
					case ConsultationRequest.SLOTS_PROPOSED -> {
						title = "Consultation slots proposed";
						message = doctorStart + " has proposed consultation times for case " + ref
								+ ". Please select a slot.";
					}
					case ConsultationRequest.SLOT_SELECTED -> {
						title = "Consultation slot selected";
						message = "You selected a consultation slot for case " + ref + " with " + doctorRef
								+ ". Awaiting confirmation.";
					}
					case ConsultationRequest.SCHEDULED -> {
						title = "Consultation scheduled";
						message = "Your consultation for case " + ref + " with " + doctorRef + " has been scheduled.";
					}
					case ConsultationRequest.CANCELLED -> {
						title = "Consultation cancelled";
						message = "Your consultation request for case " + ref + " with " + doctorRef
								+ " has been cancelled." + (request.getCancellationReason() != null
										? " Reason: " + request.getCancellationReason() : "");
					}
					default -> {
						title = "Consultation status updated";
						message = "Your consultation request status has been updated to " + request.getStatus() + ".";
					}
				}
			}
			notifications.send(new NotificationService.Draft(patient.getUserId(), "consultation_status_updated", title,
					message, request.getCaseId(), null, alert));
		});
	}

	/** Wording for the consultation the doctor holds before preparing the plan. */
	private static Text initialText(ConsultationRequest request, String previousStatus, String ref, String doctorStart,
			String doctorRef) {
		if (request.getStatus().equals(previousStatus)) {
			return new Text("Initial consultation times updated",
					doctorStart + " has updated the proposed times for your initial consultation on case " + ref
							+ ". Please choose a time.");
		}
		return switch (request.getStatus()) {
			case ConsultationRequest.SLOTS_PROPOSED -> new Text("Initial consultation: choose a time",
					doctorStart + " would like a Zoom consultation with you about case " + ref
							+ " before preparing your treatment plan. Please choose a time.");
			case ConsultationRequest.SLOT_SELECTED -> new Text("Initial consultation time selected",
					"You selected a time for your initial consultation with " + doctorRef + " (case " + ref
							+ "). Pay the consultation fee to confirm it.");
			case ConsultationRequest.SCHEDULED -> new Text("Initial consultation scheduled",
					"Your initial consultation with " + doctorRef + " for case " + ref + " has been scheduled.");
			case ConsultationRequest.CANCELLED -> new Text("Initial consultation cancelled",
					"Your initial consultation with " + doctorRef + " for case " + ref + " has been cancelled."
							+ (request.getCancellationReason() != null ? " Reason: " + request.getCancellationReason()
									: ""));
			default -> new Text("Initial consultation updated",
					"Your initial consultation for case " + ref + " has been updated.");
		};
	}

	/** Doctors usually enter their name with "Dr." already; don't double it. */
	static String withTitle(String doctorName) {
		return doctorName.matches("(?i)^dr\\.?\\s.*") ? doctorName : "Dr. " + doctorName;
	}

	private record Text(String title, String message) {
	}

	ConsultationRequest requireOwned(Patient patient, UUID requestId) {
		return requests.findByIdAndPatientId(requestId, patient.getId())
			.orElseThrow(() -> ApiException.notFound("Consultation request not found."));
	}

	/** The doctor behind a consultation: set directly on initial ones, through the plan for option ones. */
	public Optional<Doctor> doctorOf(ConsultationRequest request) {
		if (request.getDoctorId() != null) {
			return doctors.findById(request.getDoctorId());
		}
		return request.getTreatmentOptionId() == null ? Optional.empty()
				: options.findById(request.getTreatmentOptionId()).flatMap(this::doctorFor);
	}

	private Optional<Doctor> doctorFor(TreatmentOption option) {
		return plans.findById(option.getTreatmentPlanId()).flatMap(plan -> doctors.findById(plan.getDoctorId()));
	}

	private List<RequestView> withSlots(List<ConsultationRequest> list) {
		Map<UUID, List<ConsultationSlot>> slotsByRequest = list.isEmpty() ? Map.of()
				: slots.findByConsultationRequestIdInOrderBySlotTimeAsc(list.stream().map(ConsultationRequest::getId).toList())
					.stream()
					.collect(Collectors.groupingBy(ConsultationSlot::getConsultationRequestId));
		Map<UUID, BigDecimal> charged = list.isEmpty() ? Map.of()
				: payments.findByConsultationRequestIdInOrderByCreatedAtDesc(list.stream().map(ConsultationRequest::getId).toList())
					.stream()
					.collect(Collectors.toMap(Payment::getConsultationRequestId, Payment::getAmountAud, (newest, older) -> newest));
		BigDecimal currentFee = list.isEmpty() ? null : fees.consultationFeeAud();
		return list.stream().map(r -> {
			Optional<Doctor> doctor = doctorOf(r);
			return new RequestView(r, slotsByRequest.getOrDefault(r.getId(), List.of()),
					doctor.map(Doctor::getFullName).orElse(null), charged.getOrDefault(r.getId(), currentFee),
					doctor.map(Doctor::getTimeZone).orElse(AustralianTimeZones.DEFAULT));
		}).toList();
	}

	/**
	 * {@code feeAud}: what was charged once a payment exists, otherwise the current consultation fee.
	 * {@code doctorTimeZone}: the zone the doctor proposed the times in.
	 */
	public record RequestView(ConsultationRequest request, List<ConsultationSlot> slots, String doctorName,
			BigDecimal feeAud, String doctorTimeZone) {
	}

}
