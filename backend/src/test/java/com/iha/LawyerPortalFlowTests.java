package com.iha;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.LocalDate;
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
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The visa lawyer portal through HTTP: sign-up, registration with a MARN,
 * MTA's register check and approval, assignment of a visa case, the status
 * workflow with its notifications and case status, document requests, notes,
 * issuing the approved visa and the support chat.
 */
@SpringBootTest
@AutoConfigureMockMvc
class LawyerPortalFlowTests {

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
	AppUserRepository users;

	@Autowired
	PasswordEncoder passwordEncoder;

	@MockitoBean
	VerificationCodeSender codeSender;

	@Test
	void lawyerJourney() throws Exception {
		String admin = adminToken();
		String email = "lawyer-" + UUID.randomUUID() + "@example.com";
		mvc.perform(post("/api/auth/register/lawyer").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, PASSWORD)))
			.andExpect(jsonPath("$.code").value("consent_required"));
		mvc.perform(post("/api/auth/register/lawyer").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"%s\",\"acceptTerms\":true}".formatted(email, PASSWORD)))
			.andExpect(status().isAccepted());
		String token = verifyEmail(email);
		perform(get("/api/lawyer/account"), token).andExpect(jsonPath("$.registered").value(false));
		perform(get("/api/lawyer/cases"), token).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("lawyer_profile_missing"));

		// Registration: the MARN is 7 digits; a practising certificate needs its state.
		perform(registration(HttpMethod.POST, "marn", "12345", null, true), token)
			.andExpect(jsonPath("$.code").value("invalid_marn"));
		perform(registration(HttpMethod.POST, "practising_certificate", "PC-1234", null, true), token)
			.andExpect(jsonPath("$.code").value("invalid_practising_state"));
		perform(registration(HttpMethod.POST, "marn", "1798765", null, false), token)
			.andExpect(jsonPath("$.code").value("documents_required"));
		String created = perform(registration(HttpMethod.POST, "marn", "1798765", null, true), token)
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.status").value("pending"))
			.andExpect(jsonPath("$.credentialType").value("marn"))
			.andExpect(jsonPath("$.contactEmail").value(email))
			.andReturn().getResponse().getContentAsString();
		String lawyerId = JsonPath.read(created, "$.id");
		perform(get("/api/lawyer/cases"), token).andExpect(jsonPath("$.code").value("lawyer_not_approved"));

		// MTA asks for more information, the lawyer resubmits, MTA checks the OMARA register and approves.
		perform(get("/api/admin/lawyers/" + lawyerId), admin)
			.andExpect(jsonPath("$.credentialNumber").value("1798765"))
			.andExpect(jsonPath("$.documents.length()").value(1));
		perform(get("/api/admin/lawyers/" + lawyerId + "/documents/0"), admin).andExpect(status().isOk());
		review(admin, lawyerId, "more_info_requested", "Please add your professional indemnity certificate.")
			.andExpect(jsonPath("$.status").value("more_info_requested"));
		perform(registration(HttpMethod.PUT, "marn", "1798765", null, false)
			.file(new MockMultipartFile("indemnityInsurance", "pi.pdf", "application/pdf", PDF)), token)
			.andExpect(jsonPath("$.status").value("pending"))
			.andExpect(jsonPath("$.documents.length()").value(2));
		review(admin, lawyerId, "approved", null).andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("verification_required"));
		perform(get("/api/admin/verifications/lawyer/" + lawyerId), admin)
			.andExpect(jsonPath("$.required.length()").value(1))
			.andExpect(jsonPath("$.required[0].checkType").value("marn"))
			.andExpect(jsonPath("$.registerLabel").value("OMARA register of migration agents"));
		perform(post("/api/admin/verifications/lawyer/" + lawyerId).contentType(MediaType.APPLICATION_JSON)
			.content("{\"checkType\":\"practising_certificate\",\"outcome\":\"verified\",\"validUntil\":\"2099-01-01\"}"),
				admin)
			.andExpect(jsonPath("$.code").value("invalid_check"));
		perform(post("/api/admin/verifications/lawyer/" + lawyerId).contentType(MediaType.APPLICATION_JSON)
			.content("{\"checkType\":\"marn\",\"outcome\":\"verified\",\"validUntil\":\"2099-01-01\"}"), admin)
			.andExpect(jsonPath("$.allPassing").value(true));
		review(admin, lawyerId, "approved", null).andExpect(jsonPath("$.status").value("approved"));
		perform(get("/api/admin/overview"), admin).andExpect(jsonPath("$.pendingLawyers").isNumber());
		perform(get("/api/lawyer/dashboard"), token).andExpect(jsonPath("$.newCases").value(0));

		// The demo visa application moves to this lawyer.
		String visaCases = perform(get("/api/admin/visa-cases"), admin).andReturn().getResponse().getContentAsString();
		List<Map<String, Object>> demo = JsonPath.read(visaCases, "$[?(@.lawyerName == 'James Whitfield')]");
		String caseId = (String) demo.get(0).get("caseId");
		String demoLawyerId = (String) demo.get(0).get("lawyerId");
		try {
			assign(admin, caseId, lawyerId).andExpect(status().isOk());
			assign(admin, caseId, lawyerId).andExpect(jsonPath("$.code").value("already_assigned"));
			perform(get("/api/notifications"), token).andExpect(jsonPath("$[0].title").value("New visa case assigned"));
			String demoLawyer = login("lawyer@demo.local", "Demo1234");
			perform(get("/api/lawyer/cases/" + caseId), demoLawyer).andExpect(status().isNotFound());
			journey(token, caseId);
		}
		finally {
			assign(admin, caseId, demoLawyerId);
		}

		// Support chat with MTA.
		perform(get("/api/lawyer/messages"), token).andExpect(jsonPath("$.status").isString());
	}

	private void journey(String token, String caseId) throws Exception {
		String patient = login("patient@demo.local", "Demo1234");
		String doctor = login("doctor@demo.local", "Demo1234");
		perform(get("/api/lawyer/cases"), token).andExpect(jsonPath("$.length()").value(1))
			.andExpect(jsonPath("$[0].bucket").value("new"));
		String detail = perform(get("/api/lawyer/cases/" + caseId), token)
			.andExpect(jsonPath("$.form.first_name").value("Demo"))
			.andExpect(jsonPath("$.plan.hospitalName").value("St Vincent's Hospital Sydney"))
			.andExpect(jsonPath("$.nextStatuses[0]").value("under_review"))
			.andExpect(jsonPath("$.canRequestDocuments").value(false))
			.andReturn().getResponse().getContentAsString();
		List<String> categories = JsonPath.read(detail, "$.documents[*].category");
		assertThat(categories).contains("passport", "hospital_invitation", "appointment_confirmation");

		// Not yet: requests open under review; processing comes after review.
		requestDocument(token, caseId).andExpect(jsonPath("$.code").value("case_not_under_review"));
		changeStatus(token, caseId, "processing", null).andExpect(jsonPath("$.code").value("invalid_transition"));
		changeStatus(token, caseId, "under_review", null).andExpect(jsonPath("$.row.status").value("under_review"))
			.andExpect(jsonPath("$.canRequestDocuments").value(true));
		perform(get("/api/notifications"), patient)
			.andExpect(jsonPath("$[0].title").value("Your visa lawyer is reviewing your application"));

		requestDocument(token, caseId).andExpect(status().isCreated())
			.andExpect(jsonPath("$.row.status").value("additional_docs_requested"))
			.andExpect(jsonPath("$.row.bucket").value("docs_pending"))
			.andExpect(jsonPath("$.requests[0].open").value(true));
		perform(get("/api/notifications"), patient)
			.andExpect(jsonPath("$[0].title").value("Your visa lawyer requested a document"))
			.andExpect(jsonPath("$[0].message").value("Please upload: Bank Statement — Last three months (Stamped by the bank)"));

		perform(post("/api/lawyer/cases/" + caseId + "/notes").contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\":\" \"}"), token)
			.andExpect(jsonPath("$.code").value("note_required"));
		perform(post("/api/lawyer/cases/" + caseId + "/notes").contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\":\"Called the patient about the bank statement.\"}"), token)
			.andExpect(status().isCreated());
		perform(get("/api/lawyer/cases/" + caseId), token).andExpect(jsonPath("$.notes.length()").value(1));

		uploadVisa(token, caseId).andExpect(jsonPath("$.code").value("visa_not_approved"));
		changeStatus(token, caseId, "processing", null).andExpect(jsonPath("$.row.status").value("processing"));
		assertThat(caseStatus(caseId)).isEqualTo("visa_processing");
		changeStatus(token, caseId, "rejected", " ").andExpect(jsonPath("$.code").value("rejection_reason_required"));
		changeStatus(token, caseId, "approved", null).andExpect(jsonPath("$.row.status").value("approved"))
			.andExpect(jsonPath("$.nextStatuses.length()").value(0));
		assertThat(caseStatus(caseId)).isEqualTo("travel_ready");
		perform(get("/api/notifications"), doctor).andExpect(jsonPath("$[0].title").value("Patient's visa approved"));

		String visa = uploadVisa(token, caseId).andExpect(status().isCreated())
			.andExpect(jsonPath("$.category").value("approved_visa"))
			.andReturn().getResponse().getContentAsString();
		// (Seeded files live in another test context's storage folder, so download one stored here.)
		perform(get("/api/lawyer/cases/" + caseId + "/documents/" + JsonPath.read(visa, "$.id")), token)
			.andExpect(status().isOk());
		perform(get("/api/lawyer/cases/" + UUID.randomUUID() + "/documents/" + JsonPath.read(visa, "$.id")), token)
			.andExpect(status().isNotFound());
		uploadVisa(token, caseId).andExpect(status().isCreated());
		assertThat(jdbc.queryForObject(
				"select count(*) from visa_documents where case_id = ? and source = 'lawyer_issued'", Integer.class,
				UUID.fromString(caseId))).isEqualTo(1);
		perform(get("/api/lawyer/approved-visas"), token)
			.andExpect(jsonPath("$[0].approvedVisa.category").value("approved_visa"));
		perform(get("/api/notifications"), patient)
			.andExpect(jsonPath("$[0].title").value("Your approved visa is ready"));
		perform(get("/api/lawyer/dashboard"), token).andExpect(jsonPath("$.approved").value(1));
	}


	private ResultActions changeStatus(String token, String caseId, String status, String reason) throws Exception {
		String body = reason == null ? "{\"status\":\"%s\"}".formatted(status)
				: "{\"status\":\"%s\",\"rejectionReason\":\"%s\"}".formatted(status, reason);
		return perform(post("/api/lawyer/cases/" + caseId + "/status").contentType(MediaType.APPLICATION_JSON)
			.content(body), token);
	}

	private ResultActions requestDocument(String token, String caseId) throws Exception {
		return perform(post("/api/lawyer/cases/" + caseId + "/document-requests").contentType(MediaType.APPLICATION_JSON)
			.content("{\"category\":\"bank_statement\",\"documentType\":\"Last three months\",\"instructions\":\"Stamped by the bank\"}"),
				token);
	}

	private ResultActions uploadVisa(String token, String caseId) throws Exception {
		return perform(multipart("/api/lawyer/cases/" + caseId + "/approved-visa")
			.file(new MockMultipartFile("file", "visa.pdf", "application/pdf", PDF)), token);
	}

	private ResultActions assign(String admin, String caseId, String lawyerId) throws Exception {
		return perform(post("/api/admin/visa-cases/" + caseId + "/lawyer").contentType(MediaType.APPLICATION_JSON)
			.content("{\"lawyerId\":\"%s\"}".formatted(lawyerId)), admin);
	}

	private MockMultipartHttpServletRequestBuilder registration(HttpMethod method, String credentialType,
			String number, String state, boolean files) {
		MockMultipartHttpServletRequestBuilder b = multipart(method, "/api/lawyer/registration");
		if (files) {
			b.file(new MockMultipartFile("credentialCertificate", "marn.pdf", "application/pdf", PDF));
		}
		b.param("lawyerType", "individual")
			.param("name", "Priya Nair")
			.param("abnNumber", "51824753556")
			.param("phone", "+61 2 9000 1234")
			.param("address", "1 Test Street")
			.param("city", "Sydney NSW")
			.param("zipCode", "2000")
			.param("credentialType", credentialType)
			.param("credentialNumber", number)
			.param("credentialExpiresOn", LocalDate.now().plusYears(1).toString());
		if (state != null) {
			b.param("practisingState", state);
		}
		return b;
	}

	private ResultActions review(String admin, String lawyerId, String outcome, String reason) throws Exception {
		String body = reason == null ? "{\"outcome\":\"%s\"}".formatted(outcome)
				: "{\"outcome\":\"%s\",\"reason\":\"%s\"}".formatted(outcome, reason);
		return perform(post("/api/admin/lawyers/" + lawyerId + "/review").contentType(MediaType.APPLICATION_JSON)
			.content(body), admin);
	}

	private String caseStatus(String caseId) {
		return jdbc.queryForObject("select status from cases where id = ?", String.class, UUID.fromString(caseId));
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
