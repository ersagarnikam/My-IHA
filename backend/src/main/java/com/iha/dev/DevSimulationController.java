package com.iha.dev;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.iha.auth.AppUser;
import com.iha.auth.AppUserRepository;
import com.iha.auth.CurrentUser;
import com.iha.auth.Role;
import com.iha.cases.CaseRepository;
import com.iha.cases.CaseStatus;
import com.iha.cases.CaseStatusService;
import com.iha.cases.MedicalCase;
import com.iha.chat.ChatService;
import com.iha.common.ApiException;
import com.iha.consultation.ConsultationRequest;
import com.iha.consultation.ConsultationRequestRepository;
import com.iha.consultation.ConsultationService;
import com.iha.consultation.ConsultationSlot;
import com.iha.consultation.ConsultationSlotRepository;
import com.iha.patient.Patient;
import com.iha.patient.PatientService;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorCaseAssignment;
import com.iha.provider.DoctorCaseAssignmentRepository;
import com.iha.provider.DoctorRepository;
import com.iha.provider.Hospital;
import com.iha.provider.HospitalRepository;
import com.iha.storage.StorageService;
import com.iha.treatment.TreatmentOption;
import com.iha.treatment.TreatmentOptionRepository;
import com.iha.treatment.TreatmentPlan;
import com.iha.treatment.TreatmentPlanRepository;
import com.iha.treatment.TreatmentPlanSpecialist;
import com.iha.treatment.TreatmentPlanSpecialistRepository;
import com.iha.visa.VisaDocument;
import com.iha.visa.VisaDocumentRepository;

import org.springframework.context.annotation.Profile;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * DEV PROFILE ONLY. Plays the roles whose portals aren't ported yet (admin,
 * doctor, hospital) so the patient portal can be clicked through end to end.
 * Only acts on the calling patient's own records. Delete once the provider
 * and admin portals exist.
 */
@Profile("dev")
@RestController
@RequestMapping("/api/dev")
class DevSimulationController {

	private final PatientService patientService;
	private final CaseRepository cases;
	private final CaseStatusService caseStatus;
	private final AppUserRepository users;
	private final PasswordEncoder passwordEncoder;
	private final DoctorRepository doctors;
	private final HospitalRepository hospitals;
	private final DoctorCaseAssignmentRepository assignments;
	private final TreatmentPlanRepository plans;
	private final TreatmentPlanSpecialistRepository specialists;
	private final TreatmentOptionRepository options;
	private final ConsultationRequestRepository consultationRequests;
	private final ConsultationSlotRepository slots;
	private final ConsultationService consultations;
	private final VisaDocumentRepository visaDocuments;
	private final StorageService storage;
	private final ChatService chat;

	DevSimulationController(PatientService patientService, CaseRepository cases, CaseStatusService caseStatus,
			AppUserRepository users, PasswordEncoder passwordEncoder, DoctorRepository doctors,
			HospitalRepository hospitals, DoctorCaseAssignmentRepository assignments, TreatmentPlanRepository plans,
			TreatmentPlanSpecialistRepository specialists, TreatmentOptionRepository options,
			ConsultationRequestRepository consultationRequests, ConsultationSlotRepository slots,
			ConsultationService consultations, VisaDocumentRepository visaDocuments, StorageService storage,
			ChatService chat) {
		this.patientService = patientService;
		this.cases = cases;
		this.caseStatus = caseStatus;
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.doctors = doctors;
		this.hospitals = hospitals;
		this.assignments = assignments;
		this.plans = plans;
		this.specialists = specialists;
		this.options = options;
		this.consultationRequests = consultationRequests;
		this.slots = slots;
		this.consultations = consultations;
		this.visaDocuments = visaDocuments;
		this.storage = storage;
		this.chat = chat;
	}

	/** Admin + doctors: walk the case to treatment_plan and publish two options. */
	@PostMapping("/cases/{caseId}/treatment-options")
	@Transactional
	public Map<String, Object> publishOptions(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId) {
		MedicalCase medicalCase = ownCase(jwt, caseId);
		if (medicalCase.getStatus().isAtOrAfter(CaseStatus.TREATMENT_PLAN)) {
			throw ApiException.conflict("already_has_options", "This case is already past the treatment plan stage.");
		}
		for (CaseStatus step : List.of(CaseStatus.UNDER_REVIEW, CaseStatus.DOCTOR_ASSIGNED, CaseStatus.EVALUATION)) {
			if (!medicalCase.getStatus().isAtOrAfter(step)) {
				caseStatus.transition(medicalCase, EnumSet.of(medicalCase.getStatus()), step, false);
			}
		}
		seedOption(medicalCase, "Amelia Chen", "St Vincent's Hospital Sydney", "Sydney", "Minimally invasive procedure",
				new BigDecimal("18500"), new BigDecimal("9200"));
		seedOption(medicalCase, "Rahul Mehta", "Royal Melbourne Hospital", "Melbourne", "Conventional open procedure",
				new BigDecimal("14200"), new BigDecimal("11800"));
		caseStatus.transition(medicalCase, EnumSet.of(CaseStatus.EVALUATION), CaseStatus.TREATMENT_PLAN, true);
		return Map.of("status", medicalCase.getStatus());
	}

	/** Doctor: propose three times (next week, Sydney business hours). */
	@PostMapping("/consultations/{requestId}/propose-slots")
	@Transactional
	public Map<String, Object> proposeSlots(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requestId) {
		Patient patient = patientService.requireCurrent(CurrentUser.from(jwt));
		ConsultationRequest request = consultationRequests.findByIdAndPatientId(requestId, patient.getId())
			.orElseThrow(() -> ApiException.notFound("Consultation request not found."));
		ZonedDateTime base = ZonedDateTime.now(ZoneId.of("Australia/Sydney")).plusDays(7).withHour(10).withMinute(0)
			.withSecond(0).withNano(0);
		for (int i = 0; i < 3; i++) {
			Instant start = base.plusDays(i).plusHours(i * 2L).toInstant();
			slots.save(new ConsultationSlot(requestId, start, start.plusSeconds(30 * 60)));
		}
		String previous = request.getStatus();
		request.proposeSlots();
		consultations.statusChanged(request, previous, true);
		return Map.of("status", request.getStatus());
	}

	/** Hospital: send the invitation and appointment letters (needed to start the visa application). */
	@PostMapping("/cases/{caseId}/hospital-letters")
	@Transactional
	public Map<String, Object> sendLetters(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId) {
		MedicalCase medicalCase = ownCase(jwt, caseId);
		if (!medicalCase.getStatus().isAtOrAfter(CaseStatus.PAYMENT_CONFIRMED)) {
			throw ApiException.conflict("not_paid", "Letters are sent after the treatment is paid.");
		}
		for (String category : List.of(VisaDocument.HOSPITAL_INVITATION, VisaDocument.APPOINTMENT_CONFIRMATION)) {
			String path = "visa-documents/%s/%s/%s/%s.pdf".formatted(medicalCase.getPatientId(), caseId, category,
					UUID.randomUUID());
			storage.store(path, new ByteArrayInputStream(samplePdf(category).getBytes(StandardCharsets.US_ASCII)));
			visaDocuments.save(VisaDocument.issued(medicalCase.getPatientId(), caseId, null,
					VisaDocument.HOSPITAL_GENERATED, category, medicalCase.getReferenceNumber() + "-" + category + ".pdf",
					path, "application/pdf"));
		}
		return Map.of("sent", 2);
	}

	/** Coordinator: open the caller's support thread and say hello. */
	@PostMapping("/chat/open")
	@Transactional
	public Map<String, Object> openChat(@AuthenticationPrincipal Jwt jwt) {
		CurrentUser user = CurrentUser.from(jwt);
		UUID threadId = chat.threadForPatient(user).thread().getId();
		chat.openThread(threadId);
		chat.sendAsAdmin(threadId, devUser(Role.ADMIN, "coordinator").getId(),
				"Hi! I'm your MTA care coordinator. How can I help with your case?");
		return Map.of("threadId", threadId);
	}

	private void seedOption(MedicalCase medicalCase, String doctorName, String hospitalName, String city,
			String procedure, BigDecimal doctorFees, BigDecimal hospitalFees) {
		Doctor doctor = doctors.save(new Doctor(devUser(Role.DOCTOR, "doctor").getId(), doctorName));
		Hospital hospital = hospitals.save(new Hospital(devUser(Role.HOSPITAL, "hospital").getId(), hospitalName, city,
				"Australia"));
		assignments.save(new DoctorCaseAssignment(medicalCase.getId(), doctor.getId()));
		TreatmentPlan plan = plans.save(new TreatmentPlan(medicalCase.getId(), doctor.getId(), hospital.getId(),
				procedure, doctorFees, hospitalFees));
		specialists.save(new TreatmentPlanSpecialist(plan.getId(), "anaesthetist", null, new BigDecimal("1800")));
		options.save(new TreatmentOption(medicalCase.getId(), plan.getId(), new BigDecimal("1500")));
	}

	/** A throwaway provider/admin account that can receive notifications. */
	private AppUser devUser(Role role, String label) {
		AppUser user = new AppUser("dev-%s-%s@iha.local".formatted(label, UUID.randomUUID()),
				passwordEncoder.encode(UUID.randomUUID().toString()), role);
		user.markEmailVerified();
		return users.save(user);
	}

	private MedicalCase ownCase(Jwt jwt, UUID caseId) {
		Patient patient = patientService.requireCurrent(CurrentUser.from(jwt));
		return cases.findByIdAndPatientId(caseId, patient.getId())
			.orElseThrow(() -> ApiException.notFound("Case not found."));
	}

	private static String samplePdf(String title) {
		String text = "BT /F1 18 Tf 72 720 Td (" + title.replace('_', ' ') + " - sample letter) Tj ET";
		return "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
				+ "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
				+ "4 0 obj<</Length " + text.length() + ">>stream\n" + text + "\nendstream endobj\n"
				+ "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF";
	}

}
