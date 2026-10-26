package com.iha;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.util.Base64;
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

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.atLeastOnce;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Cross-cutting rules: which role reaches which API, forged tokens, sign-in and
 * code handling, password reset, other users' records, and the dev demo accounts.
 */
@SpringBootTest
@AutoConfigureMockMvc
class SecurityAndAuthTests {

	private static final byte[] PDF = "%PDF-1.7\n% test\n".getBytes(StandardCharsets.US_ASCII);
	private static final String PASSWORD = "Secret123";

	/** One read endpoint per role prefix. */
	private static final Map<String, String> ROLE_ENDPOINTS = Map.of(
			"PATIENT", "/api/patient/cases",
			"DOCTOR", "/api/doctor/account",
			"ADMIN", "/api/admin/overview",
			"HOSPITAL", "/api/hospital/anything",
			"LAWYER", "/api/lawyer/anything");

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
	void eachRoleReachesOnlyItsOwnApi() throws Exception {
		Map<String, String> tokens = Map.of(
				"PATIENT", patient(),
				"DOCTOR", tokenFor(Role.DOCTOR),
				"ADMIN", tokenFor(Role.ADMIN),
				"HOSPITAL", tokenFor(Role.HOSPITAL),
				"LAWYER", tokenFor(Role.LAWYER));

		for (var endpoint : ROLE_ENDPOINTS.entrySet()) {
			mvc.perform(get(endpoint.getValue())).andExpect(status().isUnauthorized());
			for (var caller : tokens.entrySet()) {
				int status = perform(get(endpoint.getValue()), caller.getValue()).andReturn().getResponse().getStatus();
				if (caller.getKey().equals(endpoint.getKey())) {
					assertThat(status).as("%s on %s", caller.getKey(), endpoint.getValue()).isNotIn(401, 403);
				}
				else {
					assertThat(status).as("%s on %s", caller.getKey(), endpoint.getValue()).isEqualTo(403);
				}
			}
		}

		// Shared and public endpoints.
		for (String token : tokens.values()) {
			perform(get("/api/auth/me"), token).andExpect(status().isOk());
		}
		mvc.perform(get("/api/auth/me")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/specialties")).andExpect(status().isOk());
	}

	@Test
	void forgedOrAlteredTokensAreRejected() throws Exception {
		String token = patient();
		perform(get("/api/patient/cases"), token).andExpect(status().isOk());

		String[] parts = token.split("\\.");
		Base64.Decoder decoder = Base64.getUrlDecoder();
		Base64.Encoder encoder = Base64.getUrlEncoder().withoutPadding();

		// Promote the role in the payload but keep the old signature.
		String payload = new String(decoder.decode(parts[1]), StandardCharsets.UTF_8);
		assertThat(payload).contains("PATIENT");
		String promoted = encoder.encodeToString(payload.replace("PATIENT", "ADMIN").getBytes(StandardCharsets.UTF_8));
		perform(get("/api/admin/overview"), parts[0] + "." + promoted + "." + parts[2])
			.andExpect(status().isUnauthorized());

		// Unsigned token ("alg": "none").
		String none = encoder.encodeToString("{\"alg\":\"none\",\"typ\":\"JWT\"}".getBytes(StandardCharsets.UTF_8));
		perform(get("/api/patient/cases"), none + "." + parts[1] + ".").andExpect(status().isUnauthorized());

		// Corrupted signature and plain garbage.
		String signature = parts[2];
		String flipped = (signature.charAt(0) == 'A' ? 'B' : 'A') + signature.substring(1);
		perform(get("/api/patient/cases"), parts[0] + "." + parts[1] + "." + flipped)
			.andExpect(status().isUnauthorized());
		perform(get("/api/patient/cases"), "not-a-token").andExpect(status().isUnauthorized());
	}

	@Test
	void signInDoesNotRevealWhichEmailsExist() throws Exception {
		String email = uniqueEmail();
		register(email);
		verifyEmail(email);

		login(email, "WrongPass1").andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.code").value("invalid_credentials"));
		login(uniqueEmail(), "WrongPass1").andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.code").value("invalid_credentials"));
		login(email.toUpperCase(), PASSWORD).andExpect(status().isOk());

		// Duplicate sign-up is refused; password reset answers the same for known and unknown emails.
		mvc.perform(post("/api/auth/register/patient").contentType(MediaType.APPLICATION_JSON)
			.content("{\"fullName\":\"Copy Cat\",\"email\":\"%s\",\"password\":\"%s\",\"acceptTerms\":true,\"consentHealthInfo\":true}".formatted(email, PASSWORD)))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("email_taken"));
		emailRequest("/api/auth/forgot-password", email).andExpect(status().isNoContent());
		emailRequest("/api/auth/forgot-password", uniqueEmail()).andExpect(status().isNoContent());
		emailRequest("/api/auth/resend-code", uniqueEmail()).andExpect(status().isNoContent());
	}

	@Test
	void verificationCodesStopWorkingAfterTooManyWrongGuesses() throws Exception {
		String email = uniqueEmail();
		register(email);
		String code = lastCode(email, "verify_email");
		String wrong = code.equals("000000") ? "111111" : "000000";

		login(email, PASSWORD).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("email_not_verified"));
		for (int attempt = 0; attempt < 5; attempt++) {
			verifyCode(email, wrong).andExpect(jsonPath("$.code").value("invalid_code"));
		}
		verifyCode(email, code).andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("code_expired"));

		// A new code works.
		emailRequest("/api/auth/resend-code", email).andExpect(status().isNoContent());
		verifyCode(email, lastCode(email, "verify_email")).andExpect(status().isOk())
			.andExpect(jsonPath("$.user.role").value("PATIENT"));
	}

	@Test
	void passwordResetReplacesThePasswordAndCodesAreSingleUse() throws Exception {
		String email = uniqueEmail();
		register(email);
		verifyEmail(email);

		emailRequest("/api/auth/forgot-password", email).andExpect(status().isNoContent());
		String code = lastCode(email, "reset_password");
		reset(email, code, "weak").andExpect(status().isBadRequest());
		reset(email, code, "Changed456").andExpect(status().isNoContent());
		reset(email, code, "Another789").andExpect(jsonPath("$.code").value("code_expired"));

		login(email, PASSWORD).andExpect(status().isUnauthorized());
		login(email, "Changed456").andExpect(status().isOk());
	}

	@Test
	void patientsCannotReachEachOthersRecords() throws Exception {
		String owner = patient();
		String stranger = patient();

		String created = perform(multipart("/api/patient/cases")
			.file(new MockMultipartFile("files", "scan.pdf", "application/pdf", PDF))
			.param("documentTypes", "lab_report")
			.param("specialty", "Cardiology")
			.param("description", "Chest pain on exertion for six months; stress test was abnormal last week."), owner)
			.andExpect(status().isCreated())
			.andReturn().getResponse().getContentAsString();
		String caseId = JsonPath.read(created, "$.id");
		String detail = perform(get("/api/patient/cases/" + caseId), owner).andReturn().getResponse().getContentAsString();
		String documentId = JsonPath.read(detail, "$.documents[0].id");
		perform(get("/api/patient/documents/medical/" + documentId + "/content"), owner).andExpect(status().isOk());

		perform(get("/api/patient/cases/" + caseId), stranger).andExpect(status().isNotFound());
		perform(get("/api/patient/documents/medical/" + documentId + "/content"), stranger)
			.andExpect(status().isNotFound());
		perform(multipart("/api/patient/cases/" + caseId + "/documents")
			.file(new MockMultipartFile("files", "more.pdf", "application/pdf", PDF))
			.param("documentTypes", "other"), stranger)
			.andExpect(status().isNotFound());
		perform(get("/api/patient/cases/" + caseId + "/treatment-options"), stranger).andExpect(status().isNotFound());
		perform(get("/api/patient/documents"), stranger)
			.andExpect(jsonPath("$..[?(@.id == '%s')]".formatted(documentId)).isEmpty());

		// The demo patient's paid invoices aren't reachable by anyone else.
		List<UUID> payments = jdbc.queryForList("select id from payments where status = 'completed'", UUID.class);
		assertThat(payments).isNotEmpty();
		perform(get("/api/patient/payments/" + payments.get(0) + "/invoice"), stranger).andExpect(status().isNotFound());
	}

	@Test
	void adminRoutesAnswer404ForUnknownRecords() throws Exception {
		String admin = tokenFor(Role.ADMIN);
		UUID missing = UUID.randomUUID();
		perform(get("/api/admin/doctors/" + missing), admin).andExpect(status().isNotFound());
		perform(get("/api/admin/cases/" + missing), admin).andExpect(status().isNotFound());
		perform(get("/api/admin/plans/" + missing), admin).andExpect(status().isNotFound());
		perform(get("/api/admin/chats/patient/" + missing), admin).andExpect(status().isNotFound());
		perform(post("/api/admin/doctors/" + missing + "/review").contentType(MediaType.APPLICATION_JSON)
			.content("{\"outcome\":\"approved\"}"), admin)
			.andExpect(status().isNotFound());
		perform(post("/api/admin/plans/" + missing + "/publish").contentType(MediaType.APPLICATION_JSON)
			.content("{\"mtaCommissionAud\":100}"), admin)
			.andExpect(status().isNotFound());
		perform(post("/api/admin/doctors/" + missing + "/review").contentType(MediaType.APPLICATION_JSON)
			.content("{\"outcome\":\"promoted\"}"), admin)
			.andExpect(status().isBadRequest());
	}

	@Test
	void demoAccountsAreSeededAndUsable() throws Exception {
		String patient = token(login("patient@demo.local", "Demo1234").andExpect(jsonPath("$.user.role").value("PATIENT")));
		perform(get("/api/patient/cases"), patient).andExpect(jsonPath("$.length()").value(org.hamcrest.Matchers.greaterThan(0)));

		String doctor = token(login("doctor@demo.local", "Demo1234").andExpect(jsonPath("$.user.role").value("DOCTOR")));
		perform(get("/api/doctor/cases"), doctor).andExpect(status().isOk());
		perform(get("/api/doctor/insights"), doctor).andExpect(status().isOk());

		String admin = token(login("admin@demo.local", "Demo1234").andExpect(jsonPath("$.user.role").value("ADMIN")));
		perform(get("/api/admin/overview"), admin)
			.andExpect(jsonPath("$.pendingDoctors").value(org.hamcrest.Matchers.greaterThanOrEqualTo(1)));

		String pending = token(login("pending.doctor@demo.local", "Demo1234"));
		perform(get("/api/doctor/cases"), pending).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("doctor_not_approved"));
	}

	// ── helpers ───────────────────────────────────────────────────────────

	private String patient() throws Exception {
		String email = uniqueEmail();
		register(email);
		return verifyEmail(email);
	}

	/** A verified account of any role, created directly (only patients and doctors can sign up). */
	private String tokenFor(Role role) throws Exception {
		String email = role.name().toLowerCase() + "-" + UUID.randomUUID() + "@example.com";
		AppUser user = new AppUser(email, passwordEncoder.encode(PASSWORD), role);
		user.markEmailVerified();
		users.save(user);
		return token(login(email, PASSWORD).andExpect(status().isOk()));
	}

	private void register(String email) throws Exception {
		mvc.perform(post("/api/auth/register/patient").contentType(MediaType.APPLICATION_JSON)
			.content("{\"fullName\":\"Test Patient\",\"email\":\"%s\",\"password\":\"%s\",\"acceptTerms\":true,\"consentHealthInfo\":true}".formatted(email, PASSWORD)))
			.andExpect(status().isAccepted());
	}

	private String verifyEmail(String email) throws Exception {
		return token(verifyCode(email, lastCode(email, "verify_email")).andExpect(status().isOk()));
	}

	private String lastCode(String email, String purpose) {
		ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
		verify(codeSender, atLeastOnce()).send(eq(email), eq(purpose), code.capture());
		return code.getValue();
	}

	private ResultActions verifyCode(String email, String code) throws Exception {
		return mvc.perform(post("/api/auth/verify").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"code\":\"%s\"}".formatted(email, code)));
	}

	private ResultActions reset(String email, String code, String password) throws Exception {
		return mvc.perform(post("/api/auth/reset-password").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"code\":\"%s\",\"password\":\"%s\"}".formatted(email, code, password)));
	}

	private ResultActions emailRequest(String path, String email) throws Exception {
		return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"%s\"}".formatted(email)));
	}

	private ResultActions login(String email, String password) throws Exception {
		return mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, password)));
	}

	private static String token(ResultActions result) throws Exception {
		return JsonPath.read(result.andReturn().getResponse().getContentAsString(), "$.accessToken");
	}

	private ResultActions perform(AbstractMockHttpServletRequestBuilder<?> request, String token) throws Exception {
		return mvc.perform(request.header("Authorization", "Bearer " + token));
	}

	private static String uniqueEmail() {
		return "sec-" + UUID.randomUUID() + "@example.com";
	}

}
