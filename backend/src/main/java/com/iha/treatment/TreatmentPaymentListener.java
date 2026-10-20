package com.iha.treatment;

import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.iha.audit.AuditService;
import com.iha.cases.CaseRepository;
import com.iha.cases.CaseStatus;
import com.iha.cases.CaseStatusService;
import com.iha.cases.MedicalCase;
import com.iha.notification.NotificationService;
import com.iha.payment.Payment;
import com.iha.payment.PaymentCompletedEvent;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorCaseAssignment;
import com.iha.provider.DoctorCaseAssignmentRepository;
import com.iha.provider.DoctorRepository;
import com.iha.provider.HospitalRepository;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * What happens once the treatment is paid (old webhook + the
 * {@code notify_on_treatment_plan_patient_confirmed} trigger): the case moves to
 * payment_confirmed, the chosen plan becomes patient_confirmed and its doctor and
 * hospital are told (the hospital is asked for the visa letters), and every other
 * doctor on the case is closed out.
 */
@Component
class TreatmentPaymentListener {

	private final CaseRepository cases;
	private final CaseStatusService caseStatus;
	private final TreatmentOptionRepository options;
	private final TreatmentPlanRepository plans;
	private final DoctorRepository doctors;
	private final HospitalRepository hospitals;
	private final DoctorCaseAssignmentRepository assignments;
	private final NotificationService notifications;
	private final AuditService audit;

	TreatmentPaymentListener(CaseRepository cases, CaseStatusService caseStatus, TreatmentOptionRepository options,
			TreatmentPlanRepository plans, DoctorRepository doctors, HospitalRepository hospitals,
			DoctorCaseAssignmentRepository assignments, NotificationService notifications, AuditService audit) {
		this.cases = cases;
		this.caseStatus = caseStatus;
		this.options = options;
		this.plans = plans;
		this.doctors = doctors;
		this.hospitals = hospitals;
		this.assignments = assignments;
		this.notifications = notifications;
		this.audit = audit;
	}

	@EventListener
	void onPaymentCompleted(PaymentCompletedEvent event) {
		if (!Payment.FULL_PAYMENT.equals(event.paymentType())) {
			return;
		}
		MedicalCase medicalCase = cases.findById(event.caseId()).orElseThrow();
		if (medicalCase.getStatus() != CaseStatus.TREATMENT_CONFIRMED) {
			return; // Already handled (webhook replay) or moved on.
		}
		caseStatus.transition(medicalCase, EnumSet.of(CaseStatus.TREATMENT_CONFIRMED), CaseStatus.PAYMENT_CONFIRMED,
				true);
		TreatmentOption option = options.findById(event.treatmentOptionId()).orElseThrow();
		TreatmentPlan plan = plans.findById(option.getTreatmentPlanId()).orElseThrow();
		if (!TreatmentPlan.PATIENT_CONFIRMED.equals(plan.getStatus())) {
			plan.setStatus(TreatmentPlan.PATIENT_CONFIRMED);
			onPlanConfirmed(medicalCase, plan);
		}
		audit.record(null, null, "patient", "treatment.plan_patient_confirmed", "treatment_plan", plan.getId(),
				Map.of("case_id", medicalCase.getId().toString()));
	}

	private void onPlanConfirmed(MedicalCase medicalCase, TreatmentPlan plan) {
		String procedure = plan.getProcedureName() != null ? plan.getProcedureName() : "a case";
		String ref = medicalCase.getReferenceNumber();
		var chosenAssignment = assignments.findByCaseIdAndDoctorId(medicalCase.getId(), plan.getDoctorId());
		chosenAssignment.filter(a -> DoctorCaseAssignment.CANCELLED.equals(a.getStatus()))
			.ifPresent(a -> a.setStatus(DoctorCaseAssignment.ACCEPTED));
		var assignmentId = chosenAssignment.map(DoctorCaseAssignment::getId).orElse(null);

		doctors.findById(plan.getDoctorId()).map(Doctor::getUserId).ifPresent(userId -> notifyProvider(userId,
				"treatment_plan_patient_confirmed", "Patient confirmed and paid",
				"The patient has confirmed and paid for the treatment plan for %s (Case %s).".formatted(procedure, ref),
				medicalCase, assignmentId));
		if (plan.getHospitalId() != null) {
			hospitals.findById(plan.getHospitalId())
				.filter(h -> h.getUserId() != null)
				.ifPresent(h -> notifyProvider(h.getUserId(), "treatment_plan_patient_confirmed",
						"Patient confirmed and paid",
						("The patient has confirmed and paid for %s (Case %s). Please upload the hospital invitation "
								+ "and appointment confirmation letters for this case.").formatted(procedure, ref),
						medicalCase, assignmentId));
		}

		List<DoctorCaseAssignment> others = assignments.findByCaseId(medicalCase.getId())
			.stream()
			.filter(a -> !a.getDoctorId().equals(plan.getDoctorId()))
			.filter(a -> DoctorCaseAssignment.INVITED.equals(a.getStatus())
					|| DoctorCaseAssignment.ACCEPTED.equals(a.getStatus()))
			.toList();
		for (DoctorCaseAssignment other : others) {
			other.setStatus(DoctorCaseAssignment.CANCELLED);
			plans.findByCaseId(medicalCase.getId())
				.stream()
				.filter(p -> p.getDoctorId().equals(other.getDoctorId()))
				.filter(p -> !List.of(TreatmentPlan.NOT_SELECTED, TreatmentPlan.REJECTED_BY_IHA,
						TreatmentPlan.PATIENT_CONFIRMED).contains(p.getStatus()))
				.forEach(p -> p.setStatus(TreatmentPlan.NOT_SELECTED));
			String message = ("The patient has confirmed and paid for another doctor's treatment plan for %s (Case %s). "
					+ "This case is now closed on your end.").formatted(procedure, ref);
			doctors.findById(other.getDoctorId())
				.map(Doctor::getUserId)
				.ifPresent(userId -> notifyProvider(userId, "case_closed_other_doctor_selected", "Case closed", message,
						medicalCase, other.getId()));
		}
	}

	private void notifyProvider(UUID userId, String type, String title, String message,
			MedicalCase medicalCase, UUID assignmentId) {
		notifications.send(new NotificationService.Draft(userId, type, title, message, medicalCase.getId(),
				assignmentId, true));
	}

}
