package com.iha.dev;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.iha.auth.AppUser;
import com.iha.auth.AppUserRepository;
import com.iha.auth.CurrentUser;
import com.iha.auth.Role;
import com.iha.cases.CaseRepository;
import com.iha.cases.CaseService;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.consultation.ConsultationRequest;
import com.iha.consultation.ConsultationRequestRepository;
import com.iha.consultation.ConsultationService;
import com.iha.doctor.CaseDocumentRequest;
import com.iha.doctor.CaseDocumentRequestRepository;
import com.iha.doctor.DoctorAccountService;
import com.iha.doctor.DoctorAdminService;
import com.iha.patient.Patient;
import com.iha.patient.PatientRepository;
import com.iha.payment.PaymentService;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorCaseAssignmentRepository;
import com.iha.providerchat.ProviderMessageService;
import com.iha.treatment.TreatmentOption;
import com.iha.treatment.TreatmentPlan;
import com.iha.treatment.TreatmentOptionRepository;
import com.iha.treatment.TreatmentPlanRepository;
import com.iha.verification.ProviderVerification;
import com.iha.verification.VerificationService;

import org.springframework.context.annotation.Profile;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * DEV PROFILE ONLY. Plays MTA admin and the patient for the doctor portal, so
 * a doctor's journey can be clicked through alone. Only acts on the calling
 * doctor's own records (and the patients of their cases). Delete once the
 * admin portal exists.
 */
@Profile("dev")
@RestController
@RequestMapping("/api/dev/doctor")
class DoctorDevController {

	private final DoctorAccountService accounts;
	private final DoctorAdminService admin;
	private final CaseService caseService;
	private final CaseRepository cases;
	private final CaseDocumentRequestRepository documentRequests;
	private final PatientRepository patients;
	private final AppUserRepository users;
	private final TreatmentPlanRepository plans;
	private final ConsultationService consultations;
	private final ConsultationRequestRepository consultationRequests;
	private final PaymentService payments;
	private final ProviderMessageService providerMessages;
	private final TreatmentOptionRepository options;
	private final DoctorCaseAssignmentRepository assignments;
	private final PasswordEncoder passwordEncoder;
	private final org.springframework.jdbc.core.JdbcTemplate jdbc;
	private final VerificationService verification;

	DoctorDevController(DoctorAccountService accounts, DoctorAdminService admin, CaseService caseService,
			CaseRepository cases, CaseDocumentRequestRepository documentRequests, PatientRepository patients,
			AppUserRepository users, TreatmentPlanRepository plans, ConsultationService consultations,
			ConsultationRequestRepository consultationRequests, PaymentService payments,
			ProviderMessageService providerMessages, TreatmentOptionRepository options,
			DoctorCaseAssignmentRepository assignments, PasswordEncoder passwordEncoder,
			org.springframework.jdbc.core.JdbcTemplate jdbc,
			VerificationService verification) {
		this.verification = verification;
		this.jdbc = jdbc;
		this.accounts = accounts;
		this.admin = admin;
		this.caseService = caseService;
		this.cases = cases;
		this.documentRequests = documentRequests;
		this.patients = patients;
		this.users = users;
		this.plans = plans;
		this.consultations = consultations;
		this.consultationRequests = consultationRequests;
		this.payments = payments;
		this.providerMessages = providerMessages;
		this.options = options;
		this.assignments = assignments;
		this.passwordEncoder = passwordEncoder;
	}

	/** Admin: approve the caller's pending registration. */
	@PostMapping("/approve")
	public Map<String, Object> approve(@AuthenticationPrincipal Jwt jwt) {
		Doctor doctor = accounts.requireCurrent(CurrentUser.from(jwt));
		verification.recordDemoChecks(ProviderVerification.DOCTOR, doctor.getId());
		return Map.of("status", admin.review(doctor.getId(), Doctor.APPROVED, null).getStatus());
	}

	/** Admin: ask the caller for more information (to try the resubmission form). */
	@PostMapping("/request-more-info")
	public Map<String, Object> requestMoreInfo(@AuthenticationPrincipal Jwt jwt) {
		Doctor doctor = accounts.requireCurrent(CurrentUser.from(jwt));
		return Map.of("status", admin.review(doctor.getId(), Doctor.MORE_INFO_REQUESTED,
				"Please upload a clearer copy of your medical license.").getStatus());
	}

	/** Patient + admin: a new case is submitted by the demo patient and the caller is invited to it. */
	@PostMapping("/assign-case")
	public Map<String, Object> assignCase(@AuthenticationPrincipal Jwt jwt) {
		Doctor doctor = accounts.requireActive(CurrentUser.from(jwt));
		CurrentUser patient = demoPatient();
		MedicalCase medicalCase = caseService.submit(patient, "Dermatology", null,
				"Persistent itchy rash on both forearms for eight months that flares in hot weather. Creams "
						+ "prescribed locally gave only short relief; I would like a specialist assessment.",
				List.of("prescription"), List.of(BytesMultipartFile.pdf("files", "Prescription")));
		admin.assignCase(medicalCase.getId(), doctor.getId());
		return Map.of("caseId", medicalCase.getId(), "referenceNumber", medicalCase.getReferenceNumber());
	}

	/** Patient: upload a sample file for every document the caller requested on this case. */
	@PostMapping("/cases/{caseId}/upload-requested")
	public Map<String, Object> uploadRequested(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId) {
		MedicalCase medicalCase = assignedCase(jwt, caseId);
		List<String> types = documentRequests.findByCaseIdOrderByRequestedAtDesc(caseId).stream()
			.filter(r -> CaseDocumentRequest.PENDING.equals(r.getStatus()))
			.map(CaseDocumentRequest::getDocumentType)
			.distinct()
			.toList();
		if (types.isEmpty()) {
			throw ApiException.conflict("nothing_requested", "There are no pending document requests.");
		}
		caseService.addDocuments(patientOf(medicalCase), caseId, types,
				types.stream().map(t -> (MultipartFile) BytesMultipartFile.pdf("files", t)).toList());
		return Map.of("uploaded", types.size());
	}

	/** Admin: approve the caller's submitted plan and offer it to the patient. */
	@PostMapping("/cases/{caseId}/publish-plan")
	public Map<String, Object> publishPlan(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId) {
		Doctor doctor = accounts.requireActive(CurrentUser.from(jwt));
		assignedCase(jwt, caseId);
		TreatmentPlan plan = plans.findByCaseIdAndDoctorId(caseId, doctor.getId())
			.orElseThrow(() -> ApiException.notFound("No plan for this case."));
		TreatmentOption option = admin.publishPlan(plan.getId(), new BigDecimal("1500"));
		return Map.of("optionId", option.getId());
	}

	/** Patient: request an online consultation about the caller's published plan. */
	@PostMapping("/cases/{caseId}/request-consultation")
	public Map<String, Object> requestConsultation(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId) {
		Doctor doctor = accounts.requireActive(CurrentUser.from(jwt));
		MedicalCase medicalCase = assignedCase(jwt, caseId);
		TreatmentPlan plan = plans.findByCaseIdAndDoctorId(caseId, doctor.getId())
			.orElseThrow(() -> ApiException.notFound("No plan for this case."));
		UUID optionId = optionFor(plan);
		ConsultationService.RequestView view = consultations.request(patientOf(medicalCase), optionId);
		return Map.of("consultationId", view.request().getId());
	}

	/** Patient: pick the first proposed time and pay (simulated), which schedules the meeting. */
	@PostMapping("/consultations/{requestId}/select-and-pay")
	public Map<String, Object> selectAndPay(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requestId) {
		accounts.requireActive(CurrentUser.from(jwt));
		ConsultationRequest request = consultationRequests.findById(requestId)
			.orElseThrow(() -> ApiException.notFound("Consultation request not found."));
		MedicalCase medicalCase = assignedCase(jwt, request.getCaseId());
		CurrentUser patient = patientOf(medicalCase);
		ConsultationService.RequestView view = consultations.get(patient, requestId);
		if (view.slots().isEmpty()) {
			throw ApiException.conflict("no_slots", "Propose consultation times first.");
		}
		consultations.selectSlot(patient, requestId, view.slots().get(0).getId());
		PaymentService.Checkout checkout = payments.startConsultationCheckout(patient, requestId);
		payments.simulateSuccess(patient, checkout.intentId());
		return Map.of("status", "scheduled");
	}

	/** Time travel: the caller's booked consultation has taken place (unlocks plan submission for an initial one). */
	@PostMapping("/consultations/{requestId}/mark-held")
	public Map<String, Object> markHeld(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requestId) {
		accounts.requireActive(CurrentUser.from(jwt));
		ConsultationRequest request = consultationRequests.findById(requestId)
			.orElseThrow(() -> ApiException.notFound("Consultation request not found."));
		assignedCase(jwt, request.getCaseId());
		if (!ConsultationRequest.SCHEDULED.equals(request.getStatus())) {
			throw ApiException.conflict("not_scheduled", "The patient must choose a time and pay first.");
		}
		DevTime.consultationHeld(jdbc, requestId);
		return Map.of("status", "held");
	}

	/** Admin: open the caller's support thread and say hello. */
	@PostMapping("/chat/open")
	public Map<String, Object> openChat(@AuthenticationPrincipal Jwt jwt) {
		Doctor doctor = accounts.requireActive(CurrentUser.from(jwt));
		UUID threadId = providerMessages.ensureThread(accounts.account(doctor)).getId();
		providerMessages.open(threadId);
		providerMessages.sendAsAdmin(threadId, adminUser().getId(), doctor.getUserId(),
				"Hi Doctor, this is the MTA provider team. How can we help?");
		return Map.of("threadId", threadId);
	}

	private UUID optionFor(TreatmentPlan plan) {
		return options.findByTreatmentPlanIdIn(List.of(plan.getId())).stream()
			.findFirst()
			.map(TreatmentOption::getId)
			.orElseThrow(() -> ApiException.conflict("not_published", "Publish the plan to the patient first."));
	}

	private MedicalCase assignedCase(Jwt jwt, UUID caseId) {
		Doctor doctor = accounts.requireActive(CurrentUser.from(jwt));
		MedicalCase medicalCase = cases.findById(caseId).orElseThrow(() -> ApiException.notFound("Case not found."));
		if (assignments.findByCaseIdAndDoctorId(caseId, doctor.getId()).isEmpty()) {
			throw ApiException.notFound("Case not found.");
		}
		return medicalCase;
	}

	private CurrentUser patientOf(MedicalCase medicalCase) {
		Patient patient = patients.findById(medicalCase.getPatientId()).orElseThrow();
		AppUser user = users.findById(patient.getUserId()).orElseThrow();
		return new CurrentUser(user.getId(), user.getEmail(), Role.PATIENT);
	}

	private CurrentUser demoPatient() {
		AppUser user = users.findByEmail(DevDataSeeder.PATIENT_EMAIL)
			.orElseThrow(() -> ApiException.conflict("no_demo_patient", "The demo patient account doesn't exist."));
		return new CurrentUser(user.getId(), user.getEmail(), Role.PATIENT);
	}

	private AppUser adminUser() {
		return users.findByEmail("coordinator@demo.local").orElseGet(() -> {
			AppUser user = new AppUser("coordinator@demo.local", passwordEncoder.encode(UUID.randomUUID().toString()),
					Role.ADMIN);
			user.markEmailVerified();
			return users.save(user);
		});
	}

}
