package com.iha.cases;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.Year;
import java.util.UUID;

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
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.request.MockMultipartHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/** End to end through HTTP: register → verify → sign in → submit a case → read it back. */
@SpringBootTest
@AutoConfigureMockMvc
class PatientCaseFlowTests {

	private static final byte[] PDF = "%PDF-1.7\n% test document\n".getBytes(StandardCharsets.US_ASCII);
	private static final String DESCRIPTION = "Persistent knee pain for two years, worse on stairs; "
			+ "MRI shows a torn meniscus and the local surgeon recommends arthroscopy.";

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

	@MockitoBean
	VerificationCodeSender codeSender;

	@Test
	void patientSubmitsAndReadsBackACase() throws Exception {
		String email = uniqueEmail();
		register(email);

		mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
				.content(credentials(email)))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("email_not_verified"));

		mvc.perform(post("/api/auth/verify").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"code\":\"%s\"}".formatted(email, wrongCode(sentCode(email)))))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("invalid_code"));

		String token = verifyEmail(email);

		String created = mvc.perform(caseSubmission(token, PDF).param("documentTypes", "mri_ct"))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.status").value("case_submitted"))
			.andExpect(jsonPath("$.documentCount").value(1))
			.andReturn().getResponse().getContentAsString();
		String caseId = JsonPath.read(created, "$.id");
		String reference = JsonPath.read(created, "$.referenceNumber");
		assertThat(reference).matches("IHA-" + Year.now().getValue() + "-\\d{5}");

		mvc.perform(get("/api/patient/cases").header("Authorization", bearer(token)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.length()").value(1))
			.andExpect(jsonPath("$[0].id").value(caseId));

		String detail = mvc.perform(get("/api/patient/cases/" + caseId).header("Authorization", bearer(token)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.description").value(DESCRIPTION))
			.andExpect(jsonPath("$.documents[0].fileName").value(reference + "-mri_ct.pdf"))
			.andExpect(jsonPath("$.documents[0].mimeType").value("application/pdf"))
			.andExpect(jsonPath("$.timeline[0].type").value("case_submitted"))
			.andReturn().getResponse().getContentAsString();
		String documentId = JsonPath.read(detail, "$.documents[0].id");

		mvc.perform(get("/api/patient/documents/medical/%s/content".formatted(documentId))
				.header("Authorization", bearer(token)))
			.andExpect(status().isOk())
			.andExpect(content().contentType("application/pdf"))
			.andExpect(content().bytes(PDF));

		// Encrypted at rest: the stored column is ciphertext, not the plaintext description.
		String stored = jdbc.queryForObject("select description_enc from cases where id = ?", String.class,
				UUID.fromString(caseId));
		assertThat(stored).isNotBlank().doesNotContain("knee");
	}

	@Test
	void patientsCannotSeeEachOthersCases() throws Exception {
		String owner = uniqueEmail();
		register(owner);
		String ownerToken = verifyEmail(owner);
		String created = mvc.perform(caseSubmission(ownerToken, PDF).param("documentTypes", "lab_report"))
			.andExpect(status().isCreated())
			.andReturn().getResponse().getContentAsString();
		String caseId = JsonPath.read(created, "$.id");

		String other = uniqueEmail();
		register(other);
		String otherToken = verifyEmail(other);

		mvc.perform(get("/api/patient/cases/" + caseId).header("Authorization", bearer(otherToken)))
			.andExpect(status().isNotFound());
		mvc.perform(get("/api/patient/cases").header("Authorization", bearer(otherToken)))
			.andExpect(jsonPath("$.length()").value(0));
	}

	@Test
	void rejectsFilesThatAreNotPdfOrImages() throws Exception {
		String email = uniqueEmail();
		register(email);
		String token = verifyEmail(email);

		mvc.perform(caseSubmission(token, "MZ not really a pdf".getBytes(StandardCharsets.US_ASCII))
				.param("documentTypes", "other"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("unsupported_file_type"));
	}

	@Test
	void requiresAuthenticationAndThePatientRole() throws Exception {
		mvc.perform(get("/api/patient/cases")).andExpect(status().isUnauthorized());
		mvc.perform(get("/api/specialties"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[0].name").value("Cardiology"));
	}

	@Test
	void validatesRegistration() throws Exception {
		mvc.perform(post("/api/auth/register/patient").contentType(MediaType.APPLICATION_JSON)
				.content("{\"fullName\":\"A\",\"email\":\"not-an-email\",\"password\":\"short\"}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("validation_failed"))
			.andExpect(jsonPath("$.fieldErrors.email").exists())
			.andExpect(jsonPath("$.fieldErrors.password").exists());
	}

	private void register(String email) throws Exception {
		mvc.perform(post("/api/auth/register/patient").contentType(MediaType.APPLICATION_JSON)
				.content("{\"fullName\":\"Test Patient\",\"email\":\"%s\",\"password\":\"Secret123\"}".formatted(email)))
			.andExpect(status().isAccepted());
	}

	private String verifyEmail(String email) throws Exception {
		String body = mvc.perform(post("/api/auth/verify").contentType(MediaType.APPLICATION_JSON)
				.content("{\"email\":\"%s\",\"code\":\"%s\"}".formatted(email, sentCode(email))))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.user.role").value("PATIENT"))
			.andReturn().getResponse().getContentAsString();
		return JsonPath.read(body, "$.accessToken");
	}

	private String sentCode(String email) {
		ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
		verify(codeSender).send(eq(email), eq("verify_email"), code.capture());
		return code.getValue();
	}

	private MockMultipartHttpServletRequestBuilder caseSubmission(String token, byte[] file) {
		return (MockMultipartHttpServletRequestBuilder) multipart("/api/patient/cases")
			.file(new MockMultipartFile("files", "scan.pdf", "application/pdf", file))
			.param("specialty", "Orthopaedics & Joint Replacement")
			.param("description", DESCRIPTION)
			.header("Authorization", bearer(token));
	}

	private static String credentials(String email) {
		return "{\"email\":\"%s\",\"password\":\"Secret123\"}".formatted(email);
	}

	private static String wrongCode(String code) {
		return code.equals("000000") ? "111111" : "000000";
	}

	private static String uniqueEmail() {
		return "patient-" + UUID.randomUUID() + "@example.com";
	}

	private static String bearer(String token) {
		return "Bearer " + token;
	}

}
