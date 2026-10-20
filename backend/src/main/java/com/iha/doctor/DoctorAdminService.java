package com.iha.doctor;

import java.math.BigDecimal;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.iha.audit.AuditService;
import com.iha.cases.CaseRepository;
import com.iha.cases.CaseStatus;
import com.iha.cases.CaseStatusService;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.notification.NotificationService;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorCaseAssignment;
import com.iha.provider.DoctorCaseAssignmentRepository;
import com.iha.provider.DoctorRepository;
import com.iha.treatment.TreatmentOption;
import com.iha.treatment.TreatmentOptionRepository;
import com.iha.treatment.TreatmentPlan;
import com.iha.treatment.TreatmentPlanRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * MTA admin actions on doctors and their work. The admin portal isn't ported
 * yet: for now only the dev simulation calls these, and the admin portal will
 * expose them under {@code /api/admin/**}.
 */
@Service
public class DoctorAdminService {

	private static final Set<String> REVIEW_OUTCOMES = Set.of(Doctor.APPROVED, Doctor.REJECTED,
			Doctor.MORE_INFO_REQUESTED);

	private final DoctorRepository doctors;
	private final DoctorCaseAssignmentRepository assignments;
	private final CaseRepository cases;
	private final CaseStatusService caseStatus;
	private final TreatmentPlanRepository plans;
	private final TreatmentOptionRepository options;
	private final NotificationService notifications;
	private final AuditService audit;

	DoctorAdminService(DoctorRepository doctors, DoctorCaseAssignmentRepository assignments, CaseRepository cases,
			CaseStatusService caseStatus, TreatmentPlanRepository plans, TreatmentOptionRepository options,
			NotificationService notifications, AuditService audit) {
		this.doctors = doctors;
		this.assignments = assignments;
		this.cases = cases;
		this.caseStatus = caseStatus;
		this.plans = plans;
		this.options = options;
		this.notifications = notifications;
		this.audit = audit;
	}

	/** Approve, reject (with a reason) or ask for more information. */
	@Transactional
	public Doctor review(UUID doctorId, String outcome, String reason) {
		if (!REVIEW_OUTCOMES.contains(outcome)) {
			throw ApiException.badRequest("invalid_status", "Unknown review outcome.");
		}
		Doctor doctor = doctors.findById(doctorId).orElseThrow(() -> ApiException.notFound("Doctor not found."));
		if (!Doctor.PENDING.equals(doctor.getStatus())) {
			throw ApiException.conflict("not_pending", "This registration isn't awaiting review.");
		}
		doctor.review(outcome, reason);
		if (doctor.getUserId() != null) {
			switch (outcome) {
				case Doctor.APPROVED -> notifications.notifyWithAlert(doctor.getUserId(), "registration_approved",
						"Registration approved",
						"Your MTA doctor registration has been approved. Pay the registration fee to unlock your dashboard.",
						null);
				case Doctor.REJECTED -> notifications.notifyWithAlert(doctor.getUserId(), "registration_rejected",
						"Registration not approved", "Your MTA doctor registration was not approved."
								+ (reason != null ? " Reason: " + reason : ""),
						null);
				default -> notifications.notifyWithAlert(doctor.getUserId(), "registration_more_info",
						"More information needed",
						"MTA needs more information about your registration." + (reason != null ? " " + reason : ""),
						null);
			}
		}
		audit.record(null, null, "admin", "doctor.reviewed", "doctor", doctorId, Map.of("outcome", outcome));
		return doctor;
	}

	/** Invites a doctor to evaluate a case (old admin assignment + {@code notify_doctor_on_case_assignment}). */
	@Transactional
	public DoctorCaseAssignment assignCase(UUID caseId, UUID doctorId) {
		MedicalCase medicalCase = cases.findById(caseId).orElseThrow(() -> ApiException.notFound("Case not found."));
		Doctor doctor = doctors.findById(doctorId).orElseThrow(() -> ApiException.notFound("Doctor not found."));
		if (assignments.findByCaseIdAndDoctorId(caseId, doctorId).isPresent()) {
			throw ApiException.conflict("already_assigned", "This doctor is already assigned to the case.");
		}
		if (medicalCase.getStatus() == CaseStatus.CASE_SUBMITTED) {
			caseStatus.transition(medicalCase, EnumSet.of(CaseStatus.CASE_SUBMITTED), CaseStatus.UNDER_REVIEW, false);
		}
		DoctorCaseAssignment assignment = assignments.save(new DoctorCaseAssignment(caseId, doctorId));
		if (doctor.getUserId() != null) {
			String label = medicalCase.getSpecialtyOther() != null ? medicalCase.getSpecialtyOther()
					: medicalCase.getSpecialty();
			notifications.notifyWithAlert(doctor.getUserId(), "case_assigned_by_admin", "New case assigned to you",
					"MTA Admin assigned you a new case" + (label != null ? " (" + label + ")." : "."), caseId);
		}
		audit.record(null, null, "admin", "case.doctor_assigned", "case", caseId,
				Map.of("doctor_id", doctorId.toString()));
		return assignment;
	}

	/** Approves a submitted plan and offers it to the patient as a treatment option. */
	@Transactional
	public TreatmentOption publishPlan(UUID planId, BigDecimal mtaCommissionAud) {
		TreatmentPlan plan = plans.findById(planId).orElseThrow(() -> ApiException.notFound("Plan not found."));
		if (!TreatmentPlan.SUBMITTED_TO_IHA.equals(plan.getStatus())
				&& !TreatmentPlan.IHA_APPROVED.equals(plan.getStatus())) {
			throw ApiException.conflict("invalid_transition", "Only a submitted plan can be published.");
		}
		MedicalCase medicalCase = cases.findById(plan.getCaseId()).orElseThrow();
		plan.setStatus(TreatmentPlan.PRESENTED_TO_PATIENT);
		TreatmentOption option = options.save(new TreatmentOption(plan.getCaseId(), plan.getId(), mtaCommissionAud));
		if (medicalCase.getStatus() == CaseStatus.EVALUATION) {
			caseStatus.transition(medicalCase, EnumSet.of(CaseStatus.EVALUATION), CaseStatus.TREATMENT_PLAN, true);
		}
		audit.record(null, null, "admin", "treatment_plan.published", "treatment_plan", planId,
				Map.of("case_id", plan.getCaseId().toString()));
		return option;
	}

}
