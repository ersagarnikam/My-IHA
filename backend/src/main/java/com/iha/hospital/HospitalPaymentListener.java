package com.iha.hospital;

import java.util.Optional;

import com.iha.cases.CaseRepository;
import com.iha.cases.MedicalCase;
import com.iha.notification.NotificationService;
import com.iha.payment.Payment;
import com.iha.payment.PaymentCompletedEvent;
import com.iha.provider.Hospital;
import com.iha.provider.HospitalRepository;
import com.iha.treatment.TreatmentOptionRepository;
import com.iha.treatment.TreatmentPlanRepository;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * Tells the hospital when a patient has paid for treatment there: the patient's
 * visa application waits on the hospital's two letters. (The old portal had no
 * such alert; hospitals found these cases on their Documents page.)
 */
@Component
class HospitalPaymentListener {

	private final TreatmentOptionRepository options;
	private final TreatmentPlanRepository plans;
	private final HospitalRepository hospitals;
	private final CaseRepository cases;
	private final NotificationService notifications;

	HospitalPaymentListener(TreatmentOptionRepository options, TreatmentPlanRepository plans,
			HospitalRepository hospitals, CaseRepository cases, NotificationService notifications) {
		this.options = options;
		this.plans = plans;
		this.hospitals = hospitals;
		this.cases = cases;
		this.notifications = notifications;
	}

	@EventListener
	void onPaymentCompleted(PaymentCompletedEvent event) {
		if (!Payment.FULL_PAYMENT.equals(event.paymentType()) || event.treatmentOptionId() == null) {
			return;
		}
		options.findById(event.treatmentOptionId())
			.flatMap(o -> plans.findById(o.getTreatmentPlanId()))
			.flatMap(p -> p.getHospitalId() == null ? Optional.<Hospital>empty() : hospitals.findById(p.getHospitalId()))
			.filter(h -> h.getUserId() != null && h.isApproved())
			.ifPresent(h -> notify(h, event));
	}

	private void notify(Hospital hospital, PaymentCompletedEvent event) {
		String ref = cases.findById(event.caseId()).map(MedicalCase::getReferenceNumber).orElse("a case");
		notifications.notifyWithAlert(hospital.getUserId(), "hospital_treatment_confirmed",
				"Treatment confirmed: visa letters needed",
				"The patient for case " + ref + " has paid for treatment at " + hospital.getName()
						+ ". Generate and send the Hospital Invitation and Appointment Confirmation letters so they can "
						+ "apply for their visa.",
				event.caseId());
	}

}
