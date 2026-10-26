package com.iha;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.ByteArrayOutputStream;
import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Instant;
import java.time.LocalDate;
import java.time.temporal.ChronoUnit;
import java.util.List;
import java.util.UUID;

import javax.imageio.ImageIO;

import com.iha.auth.AppUser;
import com.iha.auth.AppUserRepository;
import com.iha.auth.Role;
import com.iha.auth.VerificationCodeSender;
import com.iha.chat.ChatService;
import com.iha.consultation.ConsultationSlot;
import com.iha.consultation.ConsultationSlotRepository;
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
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockMultipartFile;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;
import org.springframework.transaction.support.TransactionTemplate;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The whole patient journey through HTTP, from onboarding to a submitted visa
 * application. Steps owned by doctors, hospitals, lawyers and admins (not yet
 * ported) are seeded directly in the database.
 */
@SpringBootTest
@AutoConfigureMockMvc
class PatientJourneyTests {

	private static final byte[] PDF = "%PDF-1.7\n% test\n".getBytes(StandardCharsets.US_ASCII);
	private static final String PASSWORD = "Secret123";

	@TempDir
	static Path storageRoot;

	@DynamicPropertySource
	static void storage(DynamicPropertyRegistry registry) {
		registry.add("iha.storage.root", () -> storageRoot.toString());
	}

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	TransactionTemplate tx;

	@Autowired
	AppUserRepository users;

	@Autowired
	PasswordEncoder passwordEncoder;

	@Autowired
	DoctorRepository doctors;

	@Autowired
	HospitalRepository hospitals;

	@Autowired
	DoctorCaseAssignmentRepository assignments;

	@Autowired
	TreatmentPlanRepository plans;

	@Autowired
	TreatmentPlanSpecialistRepository specialists;

	@Autowired
	TreatmentOptionRepository options;

	@Autowired
	ConsultationSlotRepository slots;

	@Autowired
	VisaDocumentRepository visaDocuments;

	@Autowired
	StorageService storage;

	@Autowired
	ChatService chatService;

	@MockitoBean
	VerificationCodeSender codeSender;

	@Test
	void fromOnboardingToVisaSubmission() throws Exception {
		String email = "journey-" + UUID.randomUUID() + "@example.com";
		String token = registerAndVerify(email);

		// ── Onboarding ────────────────────────────────────────────────────
		perform(get("/api/patient/profile"), token).andExpect(jsonPath("$.profileComplete").value(false));
		perform(put("/api/patient/profile/personal-info").contentType(MediaType.APPLICATION_JSON)
			.content(personalInfo("+61 123")), token)
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fieldErrors.phone").exists());
		perform(put("/api/patient/profile/personal-info").contentType(MediaType.APPLICATION_JSON)
			.content(personalInfo("+61412345678")), token).andExpect(status().isOk());
		perform(put("/api/patient/profile/medical-background").contentType(MediaType.APPLICATION_JSON)
			.content("{\"medicalHistory\":\"Hypertension\",\"allergies\":[\"Penicillin\",\" \"],\"currentMedications\":[\"Amlodipine\"]}"),
				token)
			.andExpect(jsonPath("$.allergies.length()").value(1));
		perform(put("/api/patient/profile/emergency-contact").contentType(MediaType.APPLICATION_JSON)
			.content("{\"name\":\"Li Wei\",\"relationship\":\"Spouse\",\"phone\":\"+8613812345678\"}"), token)
			.andExpect(jsonPath("$.profileComplete").value(true));
		assertThat(jdbc.queryForObject("select allergies_enc from patients where user_id = (select id from app_users where email = ?)",
				String.class, email)).doesNotContain("Penicillin");

		// ── Case ──────────────────────────────────────────────────────────
		String caseJson = perform(multipart("/api/patient/cases")
			.file(new MockMultipartFile("files", "scan.pdf", "application/pdf", PDF))
			.param("documentTypes", "lab_report")
			.param("specialty", "Cardiology")
			.param("description", "Chest tightness on exertion for six months; echocardiogram shows moderate aortic stenosis."),
				token)
			.andExpect(status().isCreated())
			.andReturn().getResponse().getContentAsString();
		UUID caseId = UUID.fromString(JsonPath.read(caseJson, "$.id"));
		perform(multipart("/api/patient/cases/" + caseId + "/documents")
			.file(new MockMultipartFile("files", "xray.pdf", "application/pdf", PDF))
			.param("documentTypes", "lab_report"), token)
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$[0].fileName").value(JsonPath.<String>read(caseJson, "$.referenceNumber") + "-lab_report-2.pdf"));

		// ── Doctor's plan, published by admin (seeded) ────────────────────
		Seeded seeded = seedTreatmentOption(caseId);
		setCaseStatus(caseId, "treatment_plan");
		perform(get("/api/patient/cases/" + caseId + "/treatment-options"), token)
			.andExpect(jsonPath("$.length()").value(1))
			.andExpect(jsonPath("$[0].hospital.name").value("Sydney General"))
			.andExpect(jsonPath("$[0].costBreakdown.total").value(16500.0))
			.andExpect(jsonPath("$[0].costBreakdown.items[3].labelKey").value("iha_service_fee"));

		// ── Consultation: request → doctor proposes → choose → pay → scheduled
		String consultation = perform(post("/api/patient/treatment-options/" + seeded.optionId() + "/consultation"), token)
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.status").value("requested"))
			.andReturn().getResponse().getContentAsString();
		UUID requestId = UUID.fromString(JsonPath.read(consultation, "$.id"));
		assertThat(countNotifications(seeded.doctorUserId(), "consultation_request_received")).isEqualTo(1);
		Instant slotStart = Instant.now().plus(3, ChronoUnit.DAYS).truncatedTo(ChronoUnit.HOURS);
		UUID slotId = slots.save(new ConsultationSlot(requestId, slotStart, slotStart.plus(30, ChronoUnit.MINUTES))).getId();
		jdbc.update("update consultation_requests set status = 'slots_proposed' where id = ?", requestId);
		perform(post("/api/patient/consultations/" + requestId + "/select-slot").contentType(MediaType.APPLICATION_JSON)
			.content("{\"slotId\":\"" + slotId + "\"}"), token)
			.andExpect(jsonPath("$.status").value("slot_selected"));
		String consultCheckout = perform(post("/api/patient/consultations/" + requestId + "/checkout"), token)
			.andExpect(jsonPath("$.provider").value("fake"))
			.andExpect(jsonPath("$.amountAud").value(200.0))
			.andReturn().getResponse().getContentAsString();
		perform(post("/api/patient/payments/simulate/" + JsonPath.read(consultCheckout, "$.intentId")), token)
			.andExpect(status().isNoContent());
		perform(get("/api/patient/consultations/" + requestId), token).andExpect(jsonPath("$.status").value("scheduled"));

		// ── Choose the option and pay ─────────────────────────────────────
		perform(post("/api/patient/treatment-options/" + seeded.optionId() + "/select"), token)
			.andExpect(jsonPath("$.selected").value(true));
		assertThat(caseStatus(caseId)).isEqualTo("treatment_confirmed");
		perform(get("/api/patient/payments"), token)
			.andExpect(jsonPath("$[?(@.paymentType == 'full_payment')].status").value("pending"));
		String checkout = perform(post("/api/patient/cases/" + caseId + "/checkout"), token)
			.andExpect(jsonPath("$.amountAud").value(16500.0))
			.andReturn().getResponse().getContentAsString();
		// A second click reuses the same pending payment and intent.
		perform(post("/api/patient/cases/" + caseId + "/checkout"), token)
			.andExpect(jsonPath("$.intentId").value(JsonPath.<String>read(checkout, "$.intentId")));
		perform(post("/api/patient/payments/simulate/" + JsonPath.read(checkout, "$.intentId")), token)
			.andExpect(status().isNoContent());
		assertThat(caseStatus(caseId)).isEqualTo("payment_confirmed");
		assertThat(jdbc.queryForObject("select status from treatment_plans where id = ?", String.class, seeded.planId()))
			.isEqualTo("patient_confirmed");
		assertThat(countNotifications(seeded.doctorUserId(), "treatment_plan_patient_confirmed")).isEqualTo(1);
		assertThat(jdbc.queryForObject("select status from doctor_case_assignments where id = ?", String.class,
				seeded.otherAssignmentId())).isEqualTo("cancelled");

		List<String> fullPaymentIds = JsonPath.read(perform(get("/api/patient/payments"), token)
			.andReturn().getResponse().getContentAsString(), "$[?(@.paymentType == 'full_payment')].id");
		String fullPaymentId = fullPaymentIds.get(0);
		byte[] invoice = perform(get("/api/patient/payments/" + fullPaymentId + "/invoice"), token)
			.andExpect(content().contentType(MediaType.APPLICATION_PDF))
			.andReturn().getResponse().getContentAsByteArray();
		assertThat(new String(invoice, 0, 5, StandardCharsets.US_ASCII)).isEqualTo("%PDF-");

		// ── Visa: needs the hospital's letters first ──────────────────────
		perform(get("/api/patient/cases/" + caseId + "/visa"), token).andExpect(jsonPath("$.canStart").value(false));
		UUID patientId = jdbc.queryForObject("select patient_id from cases where id = ?", UUID.class, caseId);
		seedHospitalLetter(patientId, caseId, seeded.hospitalId(), "hospital_invitation");
		seedHospitalLetter(patientId, caseId, seeded.hospitalId(), "appointment_confirmation");
		perform(get("/api/patient/cases/" + caseId + "/visa"), token).andExpect(jsonPath("$.canStart").value(true));

		uploadVisa(token, caseId, "passport", "passport.pdf", PDF).andExpect(status().isCreated());
		uploadVisa(token, caseId, "passport_photograph", "photo.png", png(450, 450))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("passport_photo_ratio"));
		uploadVisa(token, caseId, "passport_photograph", "photo.png", png(350, 450)).andExpect(status().isCreated());

		perform(post("/api/patient/cases/" + caseId + "/visa").contentType(MediaType.APPLICATION_JSON)
			.content(visaForm("Self-Funded")), token)
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("bank_statement_required"));
		perform(post("/api/patient/cases/" + caseId + "/visa").contentType(MediaType.APPLICATION_JSON)
			.content("{\"first_name\":\"\"}"), token)
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fieldErrors.first_name").exists())
			.andExpect(jsonPath("$.fieldErrors.passport_number").exists());
		uploadVisa(token, caseId, "bank_statement", "bank.pdf", PDF).andExpect(status().isCreated());
		String submitted = perform(post("/api/patient/cases/" + caseId + "/visa").contentType(MediaType.APPLICATION_JSON)
			.content(visaForm("Self-Funded")), token)
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.status").value("documents_submitted"))
			.andReturn().getResponse().getContentAsString();
		assertThat(caseStatus(caseId)).isEqualTo("visa_documents_submitted");
		perform(get("/api/patient/visa-submissions/" + JsonPath.read(submitted, "$.id")), token)
			.andExpect(jsonPath("$.form.first_name").value("Wei"))
			.andExpect(jsonPath("$.documents.length()").value(5));
		perform(get("/api/patient/visa-submissions"), token).andExpect(jsonPath("$.submissions.length()").value(1));

		// ── Documents page merges medical and visa files ──────────────────
		perform(get("/api/patient/documents"), token)
			.andExpect(jsonPath("$[?(@.category == 'medical')].id", org.hamcrest.Matchers.hasSize(2)))
			.andExpect(jsonPath("$[?(@.category == 'visa')].id", org.hamcrest.Matchers.hasSize(5)));

		// ── Dashboard ─────────────────────────────────────────────────────
		perform(get("/api/patient/dashboard"), token)
			.andExpect(jsonPath("$.activeCases[0].latestPaymentStatus").value("completed"))
			.andExpect(jsonPath("$.activeCases[0].visaStatus").value("documents_submitted"));
	}

	@Test
	void chatNotificationsPasswordsAndAccountDeletion() throws Exception {
		String email = "account-" + UUID.randomUUID() + "@example.com";
		String token = registerAndVerify(email);

		// Chat threads start closed; only a coordinator can open them.
		String thread = perform(get("/api/patient/chat"), token)
			.andExpect(jsonPath("$.status").value("closed"))
			.andReturn().getResponse().getContentAsString();
		perform(post("/api/patient/chat/messages").contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"Hello\"}"),
				token)
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("thread_closed"));
		UUID threadId = UUID.fromString(JsonPath.read(thread, "$.id"));
		chatService.openThread(threadId);
		perform(post("/api/patient/chat/messages").contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"Hello\"}"),
				token)
			.andExpect(status().isCreated());
		AppUser admin = users.save(new AppUser("admin-" + UUID.randomUUID() + "@example.com",
				passwordEncoder.encode(PASSWORD), Role.ADMIN));
		chatService.sendAsAdmin(threadId, admin.getId(), "Hi, how can we help?");
		perform(get("/api/patient/chat/unread-count"), token).andExpect(jsonPath("$.count").value(1));
		perform(post("/api/patient/chat/read"), token).andExpect(status().isNoContent());
		perform(get("/api/patient/chat/unread-count"), token).andExpect(jsonPath("$.count").value(0));

		// Welcome notification arrives on verification.
		perform(get("/api/notifications"), token).andExpect(jsonPath("$[0].type").value("welcome"));
		perform(get("/api/notifications/unread-count"), token).andExpect(jsonPath("$.count").value(1));
		perform(post("/api/notifications/read-all"), token).andExpect(status().isNoContent());
		perform(get("/api/notifications/unread-count"), token).andExpect(jsonPath("$.count").value(0));

		// Password change, then reset by emailed code.
		perform(put("/api/auth/password").contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"wrong\",\"newPassword\":\"Better456\"}"), token)
			.andExpect(jsonPath("$.code").value("invalid_current_password"));
		perform(put("/api/auth/password").contentType(MediaType.APPLICATION_JSON)
			.content("{\"currentPassword\":\"" + PASSWORD + "\",\"newPassword\":\"Better456\"}"), token)
			.andExpect(status().isNoContent());
		mvc.perform(post("/api/auth/forgot-password").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"" + email + "\"}")).andExpect(status().isNoContent());
		mvc.perform(post("/api/auth/reset-password").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"code\":\"%s\",\"password\":\"Newest789\"}".formatted(email,
					sentCode(email, "reset_password"))))
			.andExpect(status().isNoContent());
		String fresh = login(email, "Newest789").andExpect(status().isOk()).andReturn().getResponse().getContentAsString();
		token = JsonPath.read(fresh, "$.accessToken");

		// Deleting needs the typed confirmation, then blocks sign-in.
		perform(delete("/api/patient/account").contentType(MediaType.APPLICATION_JSON).content("{\"confirm\":\"yes\"}"), token)
			.andExpect(status().isBadRequest());
		perform(delete("/api/patient/account").contentType(MediaType.APPLICATION_JSON).content("{\"confirm\":\"DELETE\"}"),
				token)
			.andExpect(status().isNoContent());
		login(email, "Newest789").andExpect(status().isForbidden()).andExpect(jsonPath("$.code").value("account_deleted"));
		perform(get("/api/patient/profile"), token).andExpect(jsonPath("$.code").value("account_deleted"));
	}

	// ── helpers ─────────────────────────────────────────────────────────

	private Seeded seedTreatmentOption(UUID caseId) {
		return tx.execute(status -> {
			AppUser doctorUser = users.save(new AppUser("dr-" + UUID.randomUUID() + "@example.com",
					passwordEncoder.encode(PASSWORD), Role.DOCTOR));
			Doctor doctor = doctors.save(new Doctor(doctorUser.getId(), "Amelia Chen"));
			Doctor other = doctors.save(new Doctor(null, "Other Doctor"));
			Hospital hospital = hospitals.save(new Hospital(null, "Sydney General", "Sydney", "Australia"));
			assignments.save(new DoctorCaseAssignment(caseId, doctor.getId()));
			UUID otherAssignment = assignments.save(new DoctorCaseAssignment(caseId, other.getId())).getId();
			TreatmentPlan plan = plans.save(new TreatmentPlan(caseId, doctor.getId(), hospital.getId(),
					"Aortic valve replacement", new BigDecimal("10000"), new BigDecimal("5000")));
			specialists.save(new TreatmentPlanSpecialist(plan.getId(), "anaesthetist", "Dr Patel", new BigDecimal("1000")));
			TreatmentOption option = options.save(new TreatmentOption(caseId, plan.getId(), new BigDecimal("500")));
			return new Seeded(option.getId(), plan.getId(), hospital.getId(), doctorUser.getId(), otherAssignment);
		});
	}

	private void seedHospitalLetter(UUID patientId, UUID caseId, UUID hospitalId, String category) {
		String path = "visa-documents/%s/%s/%s/letter.pdf".formatted(patientId, caseId, category);
		storage.store(path, new ByteArrayInputStream(PDF));
		visaDocuments.save(VisaDocument.issued(patientId, caseId, hospitalId, VisaDocument.HOSPITAL_GENERATED, category,
				category + ".pdf", path, "application/pdf"));
	}

	private ResultActions uploadVisa(String token, UUID caseId, String category, String name, byte[] content)
			throws Exception {
		return perform(multipart("/api/patient/cases/" + caseId + "/visa/documents")
			.file(new MockMultipartFile("file", name, "application/octet-stream", content))
			.param("category", category), token);
	}

	private static String visaForm(String sourceOfFunds) {
		LocalDate today = LocalDate.now();
		return """
				{"first_name":"Wei","last_name":"Zhang","gender":"male","nationality":"China","date_of_birth":"1970-05-01",
				 "passport_number":"E12345678","passport_expiry":"%s","email":"wei@example.com","phone":"+8613812345678",
				 "has_medical_conditions":"No","health_examination_completed":"Yes",
				 "provider_name":"Dr Amelia Chen","provider_organization":"Sydney General","provider_address":"1 George St, Sydney",
				 "provider_contact":"+61291234567","source_of_funds":"%s","bank_balance":"200000",
				 "arrival_date":"%s","departure_date":"%s","criminal_record":"No","previous_visa_issues":"No",
				 "travelling_with_companion":"No"}
				""".formatted(today.plusYears(5), sourceOfFunds, today.plusDays(30), today.plusDays(60));
	}

	private static String personalInfo(String phone) {
		return """
				{"fullName":"Wei Zhang","dateOfBirth":"1970-05-01","gender":"male","nationality":"China",
				 "countryOfResidence":"China","phone":"%s","address":"Shanghai"}
				""".formatted(phone);
	}

	private static byte[] png(int width, int height) throws Exception {
		ByteArrayOutputStream out = new ByteArrayOutputStream();
		ImageIO.write(new BufferedImage(width, height, BufferedImage.TYPE_INT_RGB), "png", out);
		return out.toByteArray();
	}

	private String registerAndVerify(String email) throws Exception {
		mvc.perform(post("/api/auth/register/patient").contentType(MediaType.APPLICATION_JSON)
			.content("{\"fullName\":\"Wei Zhang\",\"email\":\"%s\",\"password\":\"%s\",\"acceptTerms\":true,\"consentHealthInfo\":true}".formatted(email, PASSWORD)))
			.andExpect(status().isAccepted());
		String body = mvc.perform(post("/api/auth/verify").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"code\":\"%s\"}".formatted(email, sentCode(email, "verify_email"))))
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
		return JsonPath.read(body, "$.accessToken");
	}

	private ResultActions login(String email, String password) throws Exception {
		return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)));
	}

	private String sentCode(String email, String purpose) {
		ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
		verify(codeSender, atLeastOnce()).send(eq(email), eq(purpose), code.capture());
		return code.getValue();
	}

	private ResultActions perform(AbstractMockHttpServletRequestBuilder<?> request, String token) throws Exception {
		return mvc.perform(request.header("Authorization", "Bearer " + token));
	}

	private void setCaseStatus(UUID caseId, String status) {
		jdbc.update("update cases set status = ? where id = ?", status, caseId);
	}

	private String caseStatus(UUID caseId) {
		return jdbc.queryForObject("select status from cases where id = ?", String.class, caseId);
	}

	private int countNotifications(UUID userId, String type) {
		return jdbc.queryForObject("select count(*) from notifications where user_id = ? and type = ?", Integer.class,
				userId, type);
	}

	record Seeded(UUID optionId, UUID planId, UUID hospitalId, UUID doctorUserId, UUID otherAssignmentId) {
	}

}
