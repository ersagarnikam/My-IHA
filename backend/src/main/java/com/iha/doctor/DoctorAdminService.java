package com.iha.doctor;

import java.math.BigDecimal;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
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
		return review(null, doctorId, outcome, reason);
	}

	@Transactional
	public Doctor review(CurrentUser actor, UUID doctorId, String outcome, String reason) {
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
		audit.record(actorId(actor), actorEmail(actor), "admin", "doctor.reviewed", "doctor", doctorId,
				Map.of("outcome", outcome));
		return doctor;
	}

	/** Invites a doctor to evaluate a case (old admin assignment + {@code notify_doctor_on_case_assignment}). */
	@Transactional
	public DoctorCaseAssignment assignCase(UUID caseId, UUID doctorId) {
		return assignCase(null, caseId, doctorId);
	}

	@Transactional
	public DoctorCaseAssignment assignCase(CurrentUser actor, UUID caseId, UUID doctorId) {
		MedicalCase medicalCase = cases.findById(caseId).orElseThrow(() -> ApiException.notFound("Case not found."));
		Doctor doctor = doctors.findById(doctorId).orElseThrow(() -> ApiException.notFound("Doctor not found."));
		if (!doctor.isActive()) {
			throw ApiException.conflict("doctor_not_active", "Only approved doctors who have paid the registration fee can be assigned.");
		}
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
		audit.record(actorId(actor), actorEmail(actor), "admin", "case.doctor_assigned", "case", caseId,
				Map.of("doctor_id", doctorId.toString()));
		return assignment;
	}

	/** Approves a submitted plan and offers it to the patient as a treatment option. */
	@Transactional
	public TreatmentOption publishPlan(UUID planId, BigDecimal mtaCommissionAud) {
		return publishPlan(null, planId, mtaCommissionAud);
	}

	@Transactional
	public TreatmentOption publishPlan(CurrentUser actor, UUID planId, BigDecimal mtaCommissionAud) {
		if (mtaCommissionAud == null || mtaCommissionAud.signum() < 0) {
			throw ApiException.badRequest("invalid_commission", "Enter MTA's service fee (0 or more).");
		}
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
		doctors.findById(plan.getDoctorId()).map(Doctor::getUserId).ifPresent(userId -> notifications.notifyWithAlert(
				userId, "plan_published", "Treatment plan sent to the patient",
				"MTA approved your treatment plan for case " + medicalCase.getReferenceNumber()
						+ " and sent it to the patient.",
				plan.getCaseId()));
		audit.record(actorId(actor), actorEmail(actor), "admin", "treatment_plan.published", "treatment_plan", planId,
				Map.of("case_id", plan.getCaseId().toString(), "mta_commission_aud", mtaCommissionAud.toPlainString()));
		return option;
	}

	/** Sends a submitted plan back to the doctor with a reason (status rejected_by_iha). */
	@Transactional
	public TreatmentPlan rejectPlan(CurrentUser actor, UUID planId, String reason) {
		TreatmentPlan plan = plans.findById(planId).orElseThrow(() -> ApiException.notFound("Plan not found."));
		if (!TreatmentPlan.SUBMITTED_TO_IHA.equals(plan.getStatus())
				&& !TreatmentPlan.IHA_REVIEW_IN_PROGRESS.equals(plan.getStatus())) {
			throw ApiException.conflict("invalid_transition", "Only a plan awaiting review can be declined.");
		}
		String trimmed = reason == null ? "" : reason.trim();
		if (trimmed.length() < 10) {
			throw ApiException.badRequest("reason_required", "Tell the doctor why (min. 10 characters).");
		}
		plan.reject(trimmed);
		MedicalCase medicalCase = cases.findById(plan.getCaseId()).orElseThrow();
		doctors.findById(plan.getDoctorId()).map(Doctor::getUserId).ifPresent(userId -> notifications.notifyWithAlert(
				userId, "plan_rejected", "Treatment plan not approved",
				"MTA didn't approve your treatment plan for case " + medicalCase.getReferenceNumber() + ". Reason: "
						+ trimmed,
				plan.getCaseId()));
		audit.record(actorId(actor), actorEmail(actor), "admin", "treatment_plan.rejected", "treatment_plan", planId,
				Map.of("case_id", plan.getCaseId().toString()));
		return plan;
	}

	private static UUID actorId(CurrentUser actor) {
		return actor == null ? null : actor.id();
	}

	private static String actorEmail(CurrentUser actor) {
		return actor == null ? null : actor.email();
	}

}
