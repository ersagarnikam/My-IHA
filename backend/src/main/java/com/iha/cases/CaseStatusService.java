package com.iha.cases;

import java.util.Set;

import com.iha.common.ApiException;
import com.iha.notification.NotificationService;
import com.iha.patient.PatientRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * The only place a case's status changes. Replaces the
 * {@code cases_notify_status_change} trigger: every transition writes the
 * patient's in-portal notification with the same titles the old trigger used
 * (the case timeline matches on them), and optionally sends email/SMS.
 */
@Service
public class CaseStatusService {

	private final CaseRepository cases;
	private final PatientRepository patients;
	private final NotificationService notifications;

	public CaseStatusService(CaseRepository cases, PatientRepository patients, NotificationService notifications) {
		this.cases = cases;
		this.patients = patients;
		this.notifications = notifications;
	}

	/**
	 * Moves the case to {@code to} if it is currently in one of {@code from}
	 * (the conditional update the old webhook used as an idempotency gate).
	 *
	 * @return whether the status changed
	 */
	@Transactional(propagation = Propagation.MANDATORY)
	public boolean transition(MedicalCase medicalCase, Set<CaseStatus> from, CaseStatus to, boolean alert) {
		if (medicalCase.getStatus() == to) {
			return false;
		}
		if (!from.contains(medicalCase.getStatus())) {
			throw ApiException.conflict("invalid_case_status",
					"This case can't move from %s to %s.".formatted(medicalCase.getStatus().dbValue(), to.dbValue()));
		}
		medicalCase.setStatus(to);
		cases.save(medicalCase);
		patients.findById(medicalCase.getPatientId()).ifPresent(patient -> {
			Text text = textFor(to, medicalCase.getReferenceNumber());
			String type = to == CaseStatus.PAYMENT_CONFIRMED ? "payment_confirmed" : "case_status_updated";
			notifications.send(new NotificationService.Draft(patient.getUserId(), type, text.title(), text.message(),
					medicalCase.getId(), null, alert));
		});
		return true;
	}

	static Text textFor(CaseStatus status, String ref) {
		return switch (status) {
			case CASE_SUBMITTED -> new Text("Case submitted",
					"Your case " + ref + " has been submitted and is awaiting review.");
			case UNDER_REVIEW -> new Text("Case under review",
					"Your case " + ref + " is now under review by our specialists.");
			case DOCTOR_ASSIGNED -> new Text("Doctor assigned", "A doctor has been assigned to your case " + ref + ".");
			case EVALUATION -> new Text("Case in evaluation",
					"Your case " + ref + " is being evaluated by your doctor.");
			case TREATMENT_PLAN -> new Text("Treatment plan ready",
					"A treatment plan is ready for your case " + ref + ".");
			case TREATMENT_CONFIRMED -> new Text("Treatment confirmed",
					"Your treatment plan for case " + ref + " has been confirmed.");
			case PAYMENT_CONFIRMED -> new Text("Payment confirmed",
					"Your payment for case " + ref + " has been confirmed. Visa processing will begin shortly.");
			case VISA_DOCUMENTS_SUBMITTED -> new Text("Visa documents submitted",
					"Your visa application for case " + ref + " has been submitted to MTA.");
			case VISA_PROCESSING -> new Text("Visa processing started",
					"Visa processing has started for your case " + ref + ".");
			case TRAVEL_READY -> new Text("Travel ready",
					"Your visa has been approved. Your case " + ref + " is ready for travel.");
			case VISA_REJECTED -> new Text("Visa application rejected", "Your visa application for case " + ref
					+ " was not approved. See your visa application for the reason given.");
			case COMPLETED -> new Text("Case completed", "Your case " + ref + " has been marked as completed.");
			case CLOSED -> new Text("Case closed", "Your case " + ref + " has been closed.");
		};
	}

	record Text(String title, String message) {
	}

}
