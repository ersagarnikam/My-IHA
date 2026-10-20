package com.iha.doctor;

import java.time.DateTimeException;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.cases.CaseRepository;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.consultation.ConsultationRequest;
import com.iha.consultation.ConsultationRequestRepository;
import com.iha.consultation.ConsultationService;
import com.iha.consultation.ConsultationSlot;
import com.iha.consultation.ConsultationSlotRepository;
import com.iha.patient.Patient;
import com.iha.patient.PatientRepository;
import com.iha.provider.Doctor;
import com.iha.treatment.TreatmentOption;
import com.iha.treatment.TreatmentOptionRepository;
import com.iha.treatment.TreatmentPlan;
import com.iha.treatment.TreatmentPlanRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * The doctor's side of online consultations (ported from
 * {@code propose_consultation_slots}, {@code cancel_consultation} and the
 * consultation pages). A doctor sees the requests made on options built from
 * their own plans. Times are entered and shown in Brisbane time.
 */
@Service
public class DoctorConsultationService {

	public static final ZoneId DOCTOR_ZONE = ZoneId.of("Australia/Brisbane");

	private final DoctorAccountService accounts;
	private final ConsultationRequestRepository requests;
	private final ConsultationSlotRepository slots;
	private final ConsultationService consultations;
	private final TreatmentPlanRepository plans;
	private final TreatmentOptionRepository options;
	private final CaseRepository cases;
	private final PatientRepository patients;
	private final AuditService audit;

	DoctorConsultationService(DoctorAccountService accounts, ConsultationRequestRepository requests,
			ConsultationSlotRepository slots, ConsultationService consultations, TreatmentPlanRepository plans,
			TreatmentOptionRepository options, CaseRepository cases, PatientRepository patients, AuditService audit) {
		this.accounts = accounts;
		this.requests = requests;
		this.slots = slots;
		this.consultations = consultations;
		this.plans = plans;
		this.options = options;
		this.cases = cases;
		this.patients = patients;
		this.audit = audit;
	}

	@Transactional(readOnly = true)
	public List<ConsultationView> list(CurrentUser user) {
		return views(requestsFor(accounts.requireActive(user), null));
	}

	@Transactional(readOnly = true)
	public ConsultationView get(CurrentUser user, UUID requestId) {
		return views(List.of(requireOwned(accounts.requireActive(user), requestId))).get(0);
	}

	List<ConsultationRequest> requestsForCase(Doctor doctor, UUID caseId) {
		return requestsFor(doctor, caseId);
	}

	/** Replaces any earlier proposal; the patient is notified either way. */
	@Transactional
	public ConsultationView proposeSlots(CurrentUser user, UUID requestId, List<SlotInput> input) {
		Doctor doctor = accounts.requireActive(user);
		ConsultationRequest request = requireOwned(doctor, requestId);
		if (!ConsultationRequest.REQUESTED.equals(request.getStatus())
				&& !ConsultationRequest.SLOTS_PROPOSED.equals(request.getStatus())) {
			throw ApiException.conflict("invalid_transition",
					"This consultation is no longer in the right stage for that action.");
		}
		if (input == null || input.isEmpty() || input.size() > 3) {
			throw ApiException.badRequest("invalid_slot_count", "Propose between 1 and 3 time slots.");
		}
		LocalDate treatmentStart = options.findById(request.getTreatmentOptionId())
			.flatMap(o -> plans.findById(o.getTreatmentPlanId()))
			.map(TreatmentPlan::getTreatmentStartDate)
			.orElse(null);
		Instant now = Instant.now();
		List<Instant[]> times = new ArrayList<>();
		for (SlotInput slot : input) {
			if (slot == null || slot.date() == null || slot.startTime() == null || slot.endTime() == null) {
				throw ApiException.badRequest("incomplete_slot",
						"Fill in a date, start time, and end time for every slot.");
			}
			LocalDate date;
			LocalTime start;
			LocalTime end;
			try {
				date = LocalDate.parse(slot.date());
				start = LocalTime.parse(slot.startTime());
				end = LocalTime.parse(slot.endTime());
			}
			catch (DateTimeException ex) {
				throw ApiException.badRequest("incomplete_slot",
						"Fill in a date, start time, and end time for every slot.");
			}
			if (treatmentStart != null && date.isAfter(treatmentStart)) {
				throw ApiException.badRequest("slot_after_treatment",
						"Slot dates cannot be after the treatment start date.");
			}
			Instant startAt = date.atTime(start).atZone(DOCTOR_ZONE).toInstant();
			Instant endAt = date.atTime(end).atZone(DOCTOR_ZONE).toInstant();
			if (!startAt.isAfter(now)) {
				throw ApiException.badRequest("slot_in_past", "Slot times must be in the future.");
			}
			if (!endAt.isAfter(startAt)) {
				throw ApiException.badRequest("slot_end_before_start",
						"Each slot's end time must be after its start time.");
			}
			times.add(new Instant[] { startAt, endAt });
		}
		slots.deleteByRequest(requestId);
		times.forEach(t -> slots.save(new ConsultationSlot(requestId, t[0], t[1])));
		String previous = request.getStatus();
		request.proposeSlots();
		requests.saveAndFlush(request);
		consultations.statusChanged(request, previous, true);
		audit.record(user.id(), user.email(), "doctor", "consultation.slots_proposed", "case", request.getCaseId(),
				Map.of("consultation_request_id", requestId.toString()));
		return views(List.of(request)).get(0);
	}

	/** Only before the patient has paid (a scheduled consultation can't be cancelled here). */
	@Transactional
	public ConsultationView cancel(CurrentUser user, UUID requestId, String reason) {
		Doctor doctor = accounts.requireActive(user);
		ConsultationRequest request = requireOwned(doctor, requestId);
		if (ConsultationRequest.CANCELLED.equals(request.getStatus())) {
			throw ApiException.conflict("already_cancelled", "This consultation has already been cancelled.");
		}
		if (ConsultationRequest.SCHEDULED.equals(request.getStatus())) {
			throw ApiException.conflict("already_scheduled",
					"This consultation is already scheduled and paid for, and can no longer be cancelled from here.");
		}
		String trimmed = reason == null ? "" : reason.trim();
		if (trimmed.length() < 5) {
			throw ApiException.badRequest("reason_required",
					"Please provide a brief reason for cancelling (min. 5 characters).");
		}
		String previous = request.getStatus();
		request.cancel(trimmed);
		requests.saveAndFlush(request);
		consultations.statusChanged(request, previous, true);
		audit.record(user.id(), user.email(), "doctor", "consultation.cancelled", "case", request.getCaseId(),
				Map.of("consultation_request_id", requestId.toString()));
		return views(List.of(request)).get(0);
	}

	private ConsultationRequest requireOwned(Doctor doctor, UUID requestId) {
		ConsultationRequest request = requests.findById(requestId)
			.orElseThrow(() -> ApiException.notFound("Consultation request not found."));
		boolean owns = options.findById(request.getTreatmentOptionId())
			.flatMap(o -> plans.findById(o.getTreatmentPlanId()))
			.map(p -> p.getDoctorId().equals(doctor.getId()))
			.orElse(false);
		if (!owns) {
			throw ApiException.notFound("Consultation request not found.");
		}
		return request;
	}

	private List<ConsultationRequest> requestsFor(Doctor doctor, UUID caseId) {
		List<UUID> planIds = plans.findByDoctorId(doctor.getId()).stream()
			.filter(p -> caseId == null || p.getCaseId().equals(caseId))
			.map(TreatmentPlan::getId)
			.toList();
		if (planIds.isEmpty()) {
			return List.of();
		}
		List<UUID> optionIds = options.findByTreatmentPlanIdIn(planIds).stream().map(TreatmentOption::getId).toList();
		return optionIds.isEmpty() ? List.of() : requests.findByTreatmentOptionIdInOrderByRequestedAtDesc(optionIds);
	}

	private List<ConsultationView> views(List<ConsultationRequest> list) {
		if (list.isEmpty()) {
			return List.of();
		}
		Map<UUID, List<ConsultationSlot>> slotsByRequest = slots
			.findByConsultationRequestIdInOrderBySlotTimeAsc(list.stream().map(ConsultationRequest::getId).toList())
			.stream()
			.collect(Collectors.groupingBy(ConsultationSlot::getConsultationRequestId));
		Map<UUID, MedicalCase> caseById = byId(cases.findAllById(list.stream().map(ConsultationRequest::getCaseId).toList()),
				MedicalCase::getId);
		Map<UUID, Patient> patientById = byId(
				patients.findAllById(list.stream().map(ConsultationRequest::getPatientId).toList()), Patient::getId);
		Map<UUID, TreatmentOption> optionById = byId(
				options.findAllById(list.stream().map(ConsultationRequest::getTreatmentOptionId).toList()),
				TreatmentOption::getId);
		Map<UUID, TreatmentPlan> planById = byId(
				plans.findAllById(optionById.values().stream().map(TreatmentOption::getTreatmentPlanId).toList()),
				TreatmentPlan::getId);
		return list.stream().map(r -> {
			MedicalCase c = caseById.get(r.getCaseId());
			Patient p = patientById.get(r.getPatientId());
			TreatmentOption o = optionById.get(r.getTreatmentOptionId());
			TreatmentPlan plan = o == null ? null : planById.get(o.getTreatmentPlanId());
			return new ConsultationView(r, slotsByRequest.getOrDefault(r.getId(), List.of()),
					c == null ? null : c.getReferenceNumber(), p == null ? null : p.getFullName(),
					plan == null ? null : plan.getProcedureName(), plan == null ? null : plan.getTreatmentStartDate());
		}).toList();
	}

	private static <T> Map<UUID, T> byId(List<T> list, Function<T, UUID> key) {
		return list.stream().collect(Collectors.toMap(key, Function.identity(), (a, b) -> a));
	}

	/** A wall-clock slot in Brisbane time: {@code 2026-11-02}, {@code 09:30}, {@code 10:00}. */
	public record SlotInput(String date, String startTime, String endTime) {
	}

	public record ConsultationView(ConsultationRequest request, List<ConsultationSlot> slots, String caseReference,
			String patientName, String procedureName, LocalDate treatmentStartDate) {
	}

}
