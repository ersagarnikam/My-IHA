package com.iha;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.iha.auth.AppUser;
import com.iha.auth.AppUserRepository;
import com.iha.auth.Role;
import com.iha.auth.VerificationCodeSender;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.mockito.ArgumentCaptor;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpMethod;
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
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The hospital portal through HTTP: sign-up, registration, MTA review and
 * resubmission, the approval gate, what a hospital can see, the visa letters
 * reaching the patient, settings and the support chat.
 */
@SpringBootTest
@AutoConfigureMockMvc
class HospitalPortalFlowTests {

	private static final byte[] PDF = "%PDF-1.7\n% test\n".getBytes(StandardCharsets.US_ASCII);
	private static final String PASSWORD = "Secret123";
	private static final String ABN = "51824753556";

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
	AppUserRepository users;

	@Autowired
	PasswordEncoder passwordEncoder;

	@MockitoBean
	VerificationCodeSender codeSender;

	@Test
	void registrationReviewAndGate() throws Exception {
		String admin = adminToken();
		String email = "hosp-" + UUID.randomUUID() + "@example.com";
		mvc.perform(post("/api/auth/register/hospital").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, PASSWORD)))
			.andExpect(status().isAccepted());
		String token = verifyEmail(email);
		perform(get("/api/hospital/account"), token).andExpect(jsonPath("$.registered").value(false));
		perform(get("/api/hospital/dashboard"), token).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("hospital_profile_missing"));

		// Validation: ABN checksum, documents.
		perform(registration(HttpMethod.POST, "12345678901", true), token)
			.andExpect(jsonPath("$.code").value("invalid_abn"));
		perform(registration(HttpMethod.POST, ABN, false), token)
			.andExpect(jsonPath("$.code").value("documents_required"));

		String created = perform(registration(HttpMethod.POST, ABN, true), token)
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.status").value("pending"))
			.andExpect(jsonPath("$.contactEmail").value(email))
			.andExpect(jsonPath("$.registrationNumber").value("HOSP-TEST-1"))
			.andExpect(jsonPath("$.documents.length()").value(2))
			.andReturn().getResponse().getContentAsString();
		String hospitalId = JsonPath.read(created, "$.id");
		perform(registration(HttpMethod.POST, ABN, true), token)
			.andExpect(jsonPath("$.code").value("already_registered"));
		perform(get("/api/hospital/dashboard"), token).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("hospital_not_approved"));
		perform(get("/api/hospital/registration/documents/0"), token).andExpect(status().isOk());

		// MTA asks for more information; the hospital resubmits; MTA approves.
		perform(get("/api/admin/overview"), admin).andExpect(jsonPath("$.pendingHospitals").isNumber());
		perform(get("/api/admin/hospitals"), admin)
			.andExpect(jsonPath("$[?(@.id == '%s')].status".formatted(hospitalId)).value("pending"));
		perform(get("/api/admin/hospitals/" + hospitalId), admin)
			.andExpect(jsonPath("$.abnNumber").value(ABN))
			.andExpect(jsonPath("$.documents.length()").value(2));
		perform(get("/api/admin/hospitals/" + hospitalId + "/documents/1"), admin).andExpect(status().isOk());
		review(admin, hospitalId, "more_info_requested", null).andExpect(jsonPath("$.code").value("reason_required"));
		review(admin, hospitalId, "more_info_requested", "Please upload the current accreditation certificate.")
			.andExpect(jsonPath("$.status").value("more_info_requested"));
		perform(get("/api/hospital/account"), token)
			.andExpect(jsonPath("$.hospital.moreInfoMessage").value("Please upload the current accreditation certificate."));
		perform(registration(HttpMethod.PUT, ABN, false)
			.file(new MockMultipartFile("otherDocuments", "accreditation.pdf", "application/pdf", PDF)), token)
			.andExpect(jsonPath("$.status").value("pending"))
			.andExpect(jsonPath("$.documents.length()").value(3));
		review(admin, hospitalId, "approved", null).andExpect(jsonPath("$.status").value("approved"));
		review(admin, hospitalId, "approved", null).andExpect(jsonPath("$.code").value("not_pending"));
		perform(get("/api/notifications"), token).andExpect(jsonPath("$[0].title").value("Registration approved"));

		// Approved: the portal opens; nothing is visible yet; doctors can now pick it.
		perform(get("/api/hospital/dashboard"), token)
			.andExpect(jsonPath("$.cases").value(0))
			.andExpect(jsonPath("$.doctors").value(0));
		perform(get("/api/hospital/cases"), token).andExpect(jsonPath("$.length()").value(0));
		perform(get("/api/hospital/messages"), token).andExpect(jsonPath("$.status").isString());
		String doctor = login("doctor@demo.local", "Demo1234");
		perform(get("/api/doctor/hospitals"), doctor).andExpect(jsonPath("$[?(@.id == '%s')]".formatted(hospitalId)).isNotEmpty());

		// Settings.
		perform(put("/api/hospital/profile/basic").contentType(MediaType.APPLICATION_JSON).content("""
				{"name":"Test Hospital Renamed","registrationNumber":"HOSP-TEST-1","abnNumber":"1","phone":"+61 2 9000 0000",
				 "country":"Australia","city":"Sydney","address":"1 Test St","zipCode":"2000"}"""), token)
			.andExpect(jsonPath("$.code").value("invalid_abn"));
		perform(put("/api/hospital/profile/details").contentType(MediaType.APPLICATION_JSON).content("""
				{"registrationType":"single_specialty","specialties":["Cardiology"],"bedCount":80,"roomTypes":["ICU"],
				 "licenseNumber":"LIC-2","accreditationBody":"ACHS"}"""), token)
			.andExpect(jsonPath("$.registrationType").value("single_specialty"))
			.andExpect(jsonPath("$.bedCount").value(80));
		perform(put("/api/hospital/profile/notification-preferences").contentType(MediaType.APPLICATION_JSON)
			.content("{\"emailNotificationsEnabled\":false,\"smsNotificationsEnabled\":true}"), token)
			.andExpect(jsonPath("$.smsNotificationsEnabled").value(true));

		// Other roles can't reach the hospital API.
		perform(get("/api/hospital/dashboard"), doctor).andExpect(status().isForbidden());
		perform(get("/api/admin/hospitals"), token).andExpect(status().isForbidden());
	}

	@Test
	void demoHospitalSeesItsCasesAndIssuesVisaLetters() throws Exception {
		String hospital = login("hospital@demo.local", "Demo1234");
		String patient = login("patient@demo.local", "Demo1234");

		String dashboard = perform(get("/api/hospital/dashboard"), hospital).andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
		assertThat(((Number) JsonPath.read(dashboard, "$.cases")).intValue()).isPositive();
		assertThat(((Number) JsonPath.read(dashboard, "$.doctors")).intValue()).isPositive();

		String cases = perform(get("/api/hospital/cases"), hospital).andReturn().getResponse().getContentAsString();
		List<Map<String, Object>> eligible = JsonPath.read(cases,
				"$[?(@.lettersEligible == true && @.caseStatus == 'payment_confirmed' && @.lettersSent == 0)]");
		assertThat(eligible).isNotEmpty();
		String planId = (String) eligible.get(0).get("planId");
		String caseId = (String) eligible.get(0).get("caseId");
		perform(get("/api/hospital/letters"), hospital)
			.andExpect(jsonPath("$[?(@.planId == '%s')]".formatted(planId)).isNotEmpty());

		// Case detail: patient clinical info only, the plan, and empty letter slots.
		perform(get("/api/hospital/cases/" + planId), hospital)
			.andExpect(jsonPath("$.row.patientName").value("Demo Patient"))
			.andExpect(jsonPath("$.patient.countryOfResidence").value("India"))
			.andExpect(jsonPath("$.patient.phone").doesNotExist())
			.andExpect(jsonPath("$.plan.procedure").isString())
			.andExpect(jsonPath("$.letters.length()").value(2))
			.andExpect(jsonPath("$.letters[0].generatedAt").doesNotExist());
		perform(get("/api/hospital/cases/" + UUID.randomUUID()), hospital).andExpect(status().isNotFound());

		// Sending needs a generated letter; then generate, preview and send both.
		perform(post("/api/hospital/cases/" + planId + "/letters/hospital_invitation/send"), hospital)
			.andExpect(jsonPath("$.code").value("not_generated"));
		perform(post("/api/hospital/cases/" + planId + "/letters/visa_approval"), hospital)
			.andExpect(jsonPath("$.code").value("invalid_document_type"));
		for (String type : List.of("hospital_invitation", "appointment_confirmation")) {
			perform(post("/api/hospital/cases/" + planId + "/letters/" + type), hospital)
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.generatedAt").isString())
				.andExpect(jsonPath("$.sentAt").doesNotExist());
			byte[] pdf = perform(get("/api/hospital/cases/" + planId + "/letters/" + type), hospital)
				.andExpect(status().isOk())
				.andReturn().getResponse().getContentAsByteArray();
			assertThat(new String(pdf, 0, 4, StandardCharsets.US_ASCII)).isEqualTo("%PDF");
		}
		// Generated but not sent: the patient can't start the visa application yet.
		assertThat(lettersReady(patient, caseId)).isFalse();
		for (String type : List.of("hospital_invitation", "appointment_confirmation")) {
			perform(post("/api/hospital/cases/" + planId + "/letters/" + type + "/send"), hospital)
				.andExpect(jsonPath("$.sentAt").isString());
		}
		assertThat(lettersReady(patient, caseId)).isTrue();
		perform(get("/api/notifications?limit=200"), patient)
			.andExpect(jsonPath("$[?(@.title == 'Hospital Invitation Letter available')]").isNotEmpty());
		// Regenerating keeps it sent and replaces the file.
		perform(post("/api/hospital/cases/" + planId + "/letters/hospital_invitation"), hospital)
			.andExpect(jsonPath("$.sentAt").isString());
		assertThat(jdbc.queryForObject("select count(*) from visa_documents where case_id = ? and source = 'hospital_generated'",
				Long.class, UUID.fromString(caseId))).isEqualTo(2);

		// Letters only for a chosen and paid plan.
		List<String> notChosen = JsonPath.read(cases, "$[?(@.chosen == false)].planId");
		if (!notChosen.isEmpty()) {
			perform(post("/api/hospital/cases/" + notChosen.get(0) + "/letters/hospital_invitation"), hospital)
				.andExpect(jsonPath("$.code").value("plan_not_selected"));
		}

		// Patients and doctors.
		String patients = perform(get("/api/hospital/patients"), hospital).andReturn().getResponse().getContentAsString();
		String patientId = JsonPath.<List<String>>read(patients, "$[?(@.fullName == 'Demo Patient')].id").get(0);
		perform(get("/api/hospital/patients/" + patientId), hospital)
			.andExpect(jsonPath("$.info.allergies[0]").value("Penicillin"))
			.andExpect(jsonPath("$.cases.length()").isNumber());
		perform(get("/api/hospital/patients/" + UUID.randomUUID()), hospital).andExpect(status().isNotFound());
		String doctors = perform(get("/api/hospital/doctors"), hospital).andReturn().getResponse().getContentAsString();
		String doctorId = JsonPath.<List<String>>read(doctors, "$[?(@.fullName == 'Dr. Amelia Chen')].id").get(0);
		perform(get("/api/hospital/doctors/" + doctorId), hospital)
			.andExpect(jsonPath("$.hospitals").isArray())
			.andExpect(jsonPath("$.availability.length()").value(7))
			.andExpect(jsonPath("$.totalCases").isNumber());
		perform(get("/api/hospital/doctors/" + UUID.randomUUID()), hospital).andExpect(status().isNotFound());
	}

	// ── helpers ───────────────────────────────────────────────────────────

	private boolean lettersReady(String patient, String caseId) throws Exception {
		String body = perform(get("/api/patient/visa-submissions"), patient).andReturn().getResponse()
			.getContentAsString();
		List<Boolean> ready = JsonPath.read(body, "$.eligibleCases[?(@.caseId == '%s')].lettersReady".formatted(caseId));
		return !ready.isEmpty() && ready.get(0);
	}

	/** The registration form; {@code files}: the two required documents. */
	private MockMultipartHttpServletRequestBuilder registration(HttpMethod method, String abn, boolean files) {
		MockMultipartHttpServletRequestBuilder b = multipart(method, "/api/hospital/registration");
		if (files) {
			b.file(new MockMultipartFile("hospitalLicense", "license.pdf", "application/pdf", PDF))
				.file(new MockMultipartFile("registrationCertificate", "certificate.pdf", "application/pdf", PDF));
		}
		b.param("name", "Test Hospital")
			.param("registrationNumber", "hosp-test-1")
			.param("abnNumber", abn)
			.param("phone", "+61 2 9000 0000")
			.param("country", "Australia")
			.param("city", "Sydney")
			.param("address", "1 Test Street")
			.param("zipCode", "2000")
			.param("registrationType", "multi_specialty")
			.param("specialties", "Cardiology")
			.param("bedCount", "120")
			.param("roomTypes", "Standard")
			.param("roomTypes", "Private")
			.param("licenseNumber", "LIC-TEST-1")
			.param("accreditationBody", "ACHS");
		return b;
	}

	private ResultActions review(String admin, String hospitalId, String outcome, String reason) throws Exception {
		String body = reason == null ? "{\"outcome\":\"%s\"}".formatted(outcome)
				: "{\"outcome\":\"%s\",\"reason\":\"%s\"}".formatted(outcome, reason);
		return perform(post("/api/admin/hospitals/" + hospitalId + "/review").contentType(MediaType.APPLICATION_JSON)
			.content(body), admin);
	}

	private String adminToken() throws Exception {
		String email = "admin-" + UUID.randomUUID() + "@example.com";
		AppUser user = new AppUser(email, passwordEncoder.encode(PASSWORD), Role.ADMIN);
		user.markEmailVerified();
		users.save(user);
		return login(email, PASSWORD);
	}

	private String verifyEmail(String email) throws Exception {
		ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
		verify(codeSender, atLeastOnce()).send(eq(email), eq("verify_email"), code.capture());
		return JsonPath.read(mvc.perform(post("/api/auth/verify").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"code\":\"%s\"}".formatted(email, code.getValue())))
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString(), "$.accessToken");
	}

	private String login(String email, String password) throws Exception {
		return JsonPath.read(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)))
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString(), "$.accessToken");
	}

	private ResultActions perform(AbstractMockHttpServletRequestBuilder<?> request, String token) throws Exception {
		return mvc.perform(request.header("Authorization", "Bearer " + token));
	}

}
