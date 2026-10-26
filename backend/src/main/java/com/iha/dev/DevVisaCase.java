package com.iha.dev;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import com.iha.auth.CurrentUser;
import com.iha.hospital.HospitalPortalService;
import com.iha.lawyer.LawyerAdminService;
import com.iha.treatment.TreatmentOption;
import com.iha.treatment.TreatmentOptionRepository;
import com.iha.visa.VisaDocument;
import com.iha.visa.VisaForm;
import com.iha.visa.VisaService;

import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * Demo data for the visa lawyer portal: a paid case at the demo hospital whose
 * letters were sent, a submitted visa application with the patient's documents,
 * assigned to the demo lawyer. Goes through the real services.
 */
@Profile("dev")
@Component
class DevVisaCase {

	private static final ZoneId ZONE = ZoneId.of("Australia/Brisbane");

	private final DevHistory history;
	private final TreatmentOptionRepository options;
	private final HospitalPortalService hospitalPortal;
	private final VisaService visa;
	private final LawyerAdminService lawyerAdmin;

	DevVisaCase(DevHistory history, TreatmentOptionRepository options, HospitalPortalService hospitalPortal,
			VisaService visa, LawyerAdminService lawyerAdmin) {
		this.history = history;
		this.options = options;
		this.hospitalPortal = hospitalPortal;
		this.visa = visa;
		this.lawyerAdmin = lawyerAdmin;
	}

	void seed(CurrentUser patient, CurrentUser doctor, CurrentUser hospitalUser, UUID hospitalId, UUID lawyerId) {
		UUID caseId = history.paid(patient, doctor, hospitalId, "Orthopaedics & Joint Replacement",
				"Total hip replacement", 19800, 10400, 0, 7);
		UUID planId = options.findByCaseIdAndPublishedAtIsNotNullOrderByCreatedAtAsc(caseId)
			.stream()
			.filter(TreatmentOption::isSelected)
			.findFirst()
			.orElseThrow()
			.getTreatmentPlanId();
		for (String letter : new String[] { VisaDocument.HOSPITAL_INVITATION, VisaDocument.APPOINTMENT_CONFIRMATION }) {
			hospitalPortal.generate(hospitalUser, planId, letter);
			hospitalPortal.send(hospitalUser, planId, letter);
		}
		visa.uploadForCase(patient, caseId, "passport", BytesMultipartFile.pdf("file", "Passport"));
		visa.uploadForCase(patient, caseId, VisaDocument.PASSPORT_PHOTOGRAPH,
				BytesMultipartFile.pdf("file", "Passport photograph"));
		visa.uploadForCase(patient, caseId, "bank_statement", BytesMultipartFile.pdf("file", "Bank statement"));
		LocalDate today = LocalDate.now(ZONE);
		visa.submit(patient, caseId, new VisaForm("Demo", "Patient", "male", "India", "1985-04-12",
				"St Vincent's Hospital Sydney, Orthopaedics", "N1234567", today.plusYears(6).toString(),
				"patient@demo.local", "+61 412 345 678", "Hip osteoarthritis; total hip replacement planned.", "Yes",
				"Type 2 diabetes, well controlled.", "No", "Dr. Amelia Chen", "St Vincent's Hospital Sydney",
				"390 Victoria Street, Darlinghurst NSW 2010", "+61 2 8382 1111", "Self-Funded", "AUD 85,000", null, null,
				null, today.plusWeeks(6).toString(), today.plusWeeks(10).toString(), "Medical treatment", "Not yet booked",
				"Serviced apartment near the hospital", "No", null, "No", null, "No", null, null, null, null));
		lawyerAdmin.assign(null, caseId, lawyerId);
	}

}
