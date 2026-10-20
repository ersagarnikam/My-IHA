package com.iha.doctor;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.cases.CaseRepository;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.common.FieldValidationException;
import com.iha.notification.NotificationService;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorCaseAssignment;
import com.iha.provider.Hospital;
import com.iha.provider.HospitalRepository;
import com.iha.treatment.TreatmentPlan;
import com.iha.treatment.TreatmentPlanRepository;
import com.iha.treatment.TreatmentPlanSpecialist;
import com.iha.treatment.TreatmentPlanSpecialistRepository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Treatment plan authoring (ported from {@code save_treatment_plan_draft},
 * {@code submit_treatment_plan} and the {@code notify_hospital_on_treatment_plan_submission}
 * trigger). One plan per doctor per case; editable only while it is a draft.
 */
@Service
public class DoctorPlanService {

	public static final Set<String> TREATMENT_TYPES = Set.of("medication_only", "surgery", "therapy");
	public static final Set<String> SPECIALIST_TYPES = Set.of("anaesthetist", "radiologist", "pathologist",
			"rehabilitation", "other");

	private final DoctorAccountService accounts;
	private final DoctorCaseService caseService;
	private final TreatmentPlanRepository plans;
	private final TreatmentPlanSpecialistRepository specialists;
	private final CaseRepository cases;
	private final HospitalRepository hospitals;
	private final NotificationService notifications;
	private final AuditService audit;
	private final JsonMapper json;

	DoctorPlanService(DoctorAccountService accounts, DoctorCaseService caseService, TreatmentPlanRepository plans,
			TreatmentPlanSpecialistRepository specialists, CaseRepository cases, HospitalRepository hospitals,
			NotificationService notifications, AuditService audit, JsonMapper json) {
		this.accounts = accounts;
		this.caseService = caseService;
		this.plans = plans;
		this.specialists = specialists;
		this.cases = cases;
		this.hospitals = hospitals;
		this.notifications = notifications;
		this.audit = audit;
		this.json = json;
	}

	/** The doctor's plan for the case (empty before the first save) plus what the form needs. */
	@Transactional(readOnly = true)
	public PlanView get(CurrentUser user, UUID caseId) {
		Doctor doctor = accounts.requireActive(user);
		DoctorCaseAssignment assignment = caseService.requireAccepted(doctor, caseId);
		MedicalCase medicalCase = cases.findById(caseId).orElseThrow(() -> ApiException.notFound("Case not found."));
		Optional<TreatmentPlan> plan = plans.findByCaseIdAndDoctorId(caseId, doctor.getId());
		return new PlanView(medicalCase, assignment, plan.orElse(null),
				plan.map(p -> specialists.findByTreatmentPlanIdOrderByCreatedAtAsc(p.getId())).orElse(List.of()),
				plan.map(p -> costItems(p.getCostBreakdownJson())).orElse(List.of()), accounts.affiliatedHospitals(doctor));
	}

	@Transactional
	public PlanView saveDraft(CurrentUser user, UUID caseId, PlanInput input) {
		Doctor doctor = accounts.requireActive(user);
		TreatmentPlan plan = save(doctor, caseId, input);
		audit.record(user.id(), user.email(), "doctor", "treatment_plan.draft_saved", "treatment_plan", plan.getId(),
				Map.of("case_id", caseId.toString()));
		return get(user, caseId);
	}

	/** Saves the form, checks the required fields, then sends the plan to MTA for review. */
	@Transactional
	public PlanView submit(CurrentUser user, UUID caseId, PlanInput input) {
		Doctor doctor = accounts.requireActive(user);
		DoctorCaseAssignment assignment = caseService.requireAccepted(doctor, caseId);
		if (assignment.getEvaluationStartedAt() == null) {
			throw ApiException.conflict("evaluation_not_started", "Start your evaluation before submitting a plan.");
		}
		Map<String, String> errors = submitErrors(input);
		if (!errors.isEmpty()) {
			throw new FieldValidationException(errors);
		}
		TreatmentPlan plan = save(doctor, caseId, input);
		if (!plan.isComplete()) {
			throw ApiException.badRequest("missing_required_fields",
					"Please complete all required fields before submitting.");
		}
		plan.submit();
		assignment.markPlanSubmitted();

		MedicalCase medicalCase = cases.findById(caseId).orElseThrow();
		hospitals.findById(plan.getHospitalId()).map(Hospital::getUserId).ifPresent(hospitalUserId -> notifications
			.send(new NotificationService.Draft(hospitalUserId, "hospital_selected_by_doctor",
					"New treatment plan for your hospital",
					doctor.getFullName() + " submitted a treatment plan naming your hospital for "
							+ (plan.getProcedureName() != null ? plan.getProcedureName() : "a case") + " (Case "
							+ medicalCase.getReferenceNumber() + ").",
					caseId, assignment.getId(), true)));
		audit.record(user.id(), user.email(), "doctor", "treatment_plan.submitted", "treatment_plan", plan.getId(),
				Map.of("case_id", caseId.toString()));
		return get(user, caseId);
	}

	private TreatmentPlan save(Doctor doctor, UUID caseId, PlanInput input) {
		caseService.requireAccepted(doctor, caseId);
		TreatmentPlan plan = plans.findByCaseIdAndDoctorId(caseId, doctor.getId())
			.orElseGet(() -> plans.save(TreatmentPlan.draft(caseId, doctor.getId())));
		if (!plan.isDraft()) {
			throw ApiException.conflict("invalid_transition", "This plan has already been submitted.");
		}
		Map<String, String> errors = draftErrors(input);
		if (input.hospitalId() != null && !accounts.hospitalIds(doctor).contains(input.hospitalId())) {
			errors.put("hospitalId", "Choose one of your affiliated hospitals.");
		}
		if (!errors.isEmpty()) {
			throw new FieldValidationException(errors);
		}
		List<CostItem> items = input.costItems() == null ? List.of() : input.costItems();
		plan.applyDraft(new TreatmentPlan.Draft(blank(input.diagnosis()), blank(input.treatmentType()),
				blank(input.procedureName()), blank(input.description()), blank(input.technique()),
				blank(input.expectedOutcome()), blank(input.successRate()), input.treatmentStartDate(),
				input.treatmentEndDate(), blank(input.recoveryTime()), blank(input.estimatedLengthOfStay()),
				input.hospitalId(), blank(input.department()), blank(input.roomCategory()),
				blank(input.specialRequirements()), input.doctorFeesAud(), input.hospitalFeesAud(),
				json.writeValueAsString(Map.of("items", items, "total",
						items.stream().map(CostItem::amount).reduce(BigDecimal.ZERO, BigDecimal::add))),
				blank(input.costNotes()), blank(input.patientInstructions()),
				input.aftercare() == null ? List.of()
						: input.aftercare().stream().map(String::trim).filter(s -> !s.isEmpty()).toList()));
		plans.saveAndFlush(plan);
		specialists.deleteByPlan(plan.getId());
		if (input.specialists() != null) {
			for (SpecialistInput s : input.specialists()) {
				specialists.save(new TreatmentPlanSpecialist(plan.getId(), s.specialistType().trim(),
						blank(s.specialistName()), s.costAud(), blank(s.notes())));
			}
		}
		return plan;
	}

	private static Map<String, String> draftErrors(PlanInput input) {
		Map<String, String> errors = new LinkedHashMap<>();
		if (input.treatmentType() != null && !input.treatmentType().isBlank()
				&& !TREATMENT_TYPES.contains(input.treatmentType())) {
			errors.put("treatmentType", "Select a treatment type");
		}
		if (input.treatmentStartDate() != null && input.treatmentStartDate().isBefore(LocalDate.now())) {
			errors.put("treatmentStartDate", "Treatment start date cannot be in the past");
		}
		if (input.treatmentStartDate() != null && input.treatmentEndDate() != null
				&& input.treatmentEndDate().isBefore(input.treatmentStartDate())) {
			errors.put("treatmentEndDate", "Treatment end date must be on or after the start date");
		}
		if (negative(input.doctorFeesAud())) {
			errors.put("doctorFeesAud", "Amount must be 0 or more");
		}
		if (negative(input.hospitalFeesAud())) {
			errors.put("hospitalFeesAud", "Amount must be 0 or more");
		}
		List<CostItem> items = input.costItems() == null ? List.of() : input.costItems();
		for (int i = 0; i < items.size(); i++) {
			CostItem item = items.get(i);
			if (item == null || item.label() == null || item.label().isBlank()) {
				errors.put("costItems." + i + ".label", "Label is required");
			}
			if (item == null || item.amount() == null || item.amount().signum() < 0) {
				errors.put("costItems." + i + ".amount", "Amount must be 0 or more");
			}
		}
		List<SpecialistInput> people = input.specialists() == null ? List.of() : input.specialists();
		for (int i = 0; i < people.size(); i++) {
			SpecialistInput s = people.get(i);
			if (s == null || s.specialistType() == null || !SPECIALIST_TYPES.contains(s.specialistType())) {
				errors.put("specialists." + i + ".specialistType", "Specialist role is required");
			}
			if (s == null || s.costAud() == null || s.costAud().signum() <= 0) {
				errors.put("specialists." + i + ".costAud", "Cost must be greater than 0");
			}
		}
		return errors;
	}

	private static Map<String, String> submitErrors(PlanInput input) {
		Map<String, String> errors = draftErrors(input);
		if (input.hospitalId() == null) {
			errors.put("hospitalId", "Select a hospital before submitting");
		}
		if (input.diagnosis() == null || input.diagnosis().trim().length() < 10) {
			errors.put("diagnosis", "Diagnosis must be at least 10 characters");
		}
		if (input.treatmentType() == null || input.treatmentType().isBlank()) {
			errors.put("treatmentType", "Select a treatment type");
		}
		if (input.procedureName() == null || input.procedureName().isBlank()) {
			errors.put("procedureName", "Recommended treatment is required");
		}
		if (input.doctorFeesAud() == null || input.doctorFeesAud().signum() <= 0) {
			errors.put("doctorFeesAud", "Doctor fees are required and must be greater than 0");
		}
		if (input.treatmentStartDate() == null) {
			errors.put("treatmentStartDate", "Treatment start date is required");
		}
		if (input.treatmentEndDate() == null) {
			errors.put("treatmentEndDate", "Treatment end date is required");
		}
		if (input.estimatedLengthOfStay() == null || input.estimatedLengthOfStay().isBlank()) {
			errors.put("estimatedLengthOfStay", "Estimated length of stay is required");
		}
		return errors;
	}

	List<CostItem> costItems(String costBreakdownJson) {
		List<CostItem> items = new java.util.ArrayList<>();
		for (JsonNode n : json.readTree(costBreakdownJson).path("items")) {
			items.add(new CostItem(n.path("label").asString(), n.path("amount").decimalValue()));
		}
		return items;
	}

	private static boolean negative(BigDecimal value) {
		return value != null && value.signum() < 0;
	}

	private static String blank(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	public record CostItem(String label, BigDecimal amount) {
	}

	public record SpecialistInput(String specialistType, String specialistName, BigDecimal costAud, String notes) {
	}

	public record PlanInput(String diagnosis, String treatmentType, String procedureName, String description,
			String technique, String expectedOutcome, String successRate, LocalDate treatmentStartDate,
			LocalDate treatmentEndDate, String recoveryTime, String estimatedLengthOfStay, UUID hospitalId,
			String department, String roomCategory, String specialRequirements, BigDecimal doctorFeesAud,
			BigDecimal hospitalFeesAud, List<CostItem> costItems, String costNotes, String patientInstructions,
			List<String> aftercare, List<SpecialistInput> specialists) {
	}

	public record PlanView(MedicalCase medicalCase, DoctorCaseAssignment assignment, TreatmentPlan plan,
			List<TreatmentPlanSpecialist> specialists, List<CostItem> costItems, List<Hospital> hospitals) {
	}

}
