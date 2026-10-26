package com.iha;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import com.iha.auth.AppUser;
import com.iha.auth.AppUserRepository;
import com.iha.auth.Role;
import com.iha.auth.VerificationCodeSender;
import com.iha.provider.Hospital;
import com.iha.provider.HospitalRepository;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The admin portal through HTTP: access control, doctor approval, case
 * assignment, plan publishing and declining, and the two chat inboxes.
 */
@SpringBootTest
@AutoConfigureMockMvc
class AdminPortalFlowTests {

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

	@Autowired
	HospitalRepository hospitals;

	@MockitoBean
	VerificationCodeSender codeSender;

	@Test
	void adminJourney() throws Exception {
		String adminToken = admin();
		Hospital hospital = hospitals.save(new Hospital(null, "Admin Test Hospital", "Brisbane", "Australia"));

		// ── Only admins get in ─────────────────────────────────────────────
		String patientEmail = "pat-" + UUID.randomUUID() + "@example.com";
		mvc.perform(post("/api/auth/register/patient").contentType(MediaType.APPLICATION_JSON)
			.content("{\"fullName\":\"Ana Lopez\",\"email\":\"%s\",\"password\":\"%s\"}".formatted(patientEmail, PASSWORD)))
			.andExpect(status().isAccepted());
		String patientToken = verifyEmail(patientEmail);
		perform(get("/api/admin/overview"), patientToken).andExpect(status().isForbidden());
		mvc.perform(get("/api/admin/overview")).andExpect(status().isUnauthorized());

		// ── Doctor approval ───────────────────────────────────────────────
		String doctorEmail = "doc-" + UUID.randomUUID() + "@example.com";
		mvc.perform(post("/api/auth/register/doctor").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(doctorEmail, PASSWORD)))
			.andExpect(status().isAccepted());
		String doctorToken = verifyEmail(doctorEmail);
		String registered = perform(multipart("/api/doctor/registration")
			.file(new MockMultipartFile("medicalLicense", "license.pdf", "application/pdf", PDF))
			.file(new MockMultipartFile("degreeCertificate", "degree.pdf", "application/pdf", PDF))
			.param("fullName", "Dr. Ken Ito")
			.param("contactPhone", "+61412345678")
			.param("specialties", "Cardiology")
			.param("qualifications", "MBBS")
			.param("yearsOfExperience", "8")
			.param("licenseNumber", "MED0005555555")
			.param("bio", "Cardiologist.")
			.param("languagesSpoken", "English")
			.param("department", "Cardiology")
			.param("role", "consultant")
			.param("hospitalIds", hospital.getId().toString())
			.param("workingDays", "mon"), doctorToken)
			.andExpect(status().isCreated())
			.andReturn().getResponse().getContentAsString();
		String doctorId = JsonPath.read(registered, "$.id");

		perform(get("/api/admin/overview"), adminToken).andExpect(jsonPath("$.pendingDoctors").isNumber());
		perform(get("/api/admin/doctors"), adminToken)
			.andExpect(jsonPath("$[?(@.id == '%s')].status".formatted(doctorId)).value("pending"));
		perform(get("/api/admin/doctors/" + doctorId), adminToken)
			.andExpect(jsonPath("$.licenseNumber").value("MED0005555555"))
			.andExpect(jsonPath("$.hospitals[0]").value("Admin Test Hospital"))
			.andExpect(jsonPath("$.documents.length()").value(2));
		perform(get("/api/admin/doctors/" + doctorId + "/documents/0"), adminToken).andExpect(status().isOk());
		perform(post("/api/admin/doctors/" + doctorId + "/review").contentType(MediaType.APPLICATION_JSON)
			.content("{\"outcome\":\"more_info_requested\"}"), adminToken)
			.andExpect(jsonPath("$.code").value("reason_required"));
		// Approval needs a passing AHPRA register check.
		perform(post("/api/admin/doctors/" + doctorId + "/review").contentType(MediaType.APPLICATION_JSON)
			.content("{\"outcome\":\"approved\"}"), adminToken)
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("verification_required"));
		perform(get("/api/admin/verifications/doctor/" + doctorId), adminToken)
			.andExpect(jsonPath("$.required[0].checkType").value("ahpra"))
			.andExpect(jsonPath("$.required[0].current").doesNotExist())
			.andExpect(jsonPath("$.registerUrl").isString());
		perform(post("/api/admin/verifications/doctor/" + doctorId).contentType(MediaType.APPLICATION_JSON)
			.content("{\"checkType\":\"ahpra\",\"outcome\":\"verified\"}"), adminToken)
			.andExpect(jsonPath("$.code").value("valid_until_required"));
		perform(post("/api/admin/verifications/doctor/" + doctorId).contentType(MediaType.APPLICATION_JSON)
			.content("{\"checkType\":\"ahpra\",\"outcome\":\"verified\",\"validUntil\":\"2099-09-30\",\"details\":\"MED0005555555, general and specialist\"}"),
				adminToken)
			.andExpect(jsonPath("$.allPassing").value(true))
			.andExpect(jsonPath("$.required[0].current.checkedBy").isString());
		perform(post("/api/admin/verifications/doctor/" + UUID.randomUUID()).contentType(MediaType.APPLICATION_JSON)
			.content("{\"checkType\":\"ahpra\",\"outcome\":\"failed\"}"), adminToken)
			.andExpect(status().isNotFound());
		perform(post("/api/admin/doctors/" + doctorId + "/review").contentType(MediaType.APPLICATION_JSON)
			.content("{\"outcome\":\"approved\"}"), adminToken)
			.andExpect(jsonPath("$.status").value("approved"));
		perform(get("/api/notifications"), doctorToken)
			.andExpect(jsonPath("$[0].title").value("Registration approved"));
		assertThat(jdbc.queryForObject("select actor_email from audit_logs where action = 'doctor.reviewed' "
				+ "and entity_id = ?", String.class, UUID.fromString(doctorId))).startsWith("admin-");

		// Unpaid doctors can't be assigned yet.
		UUID caseA = submitCase(patientToken);
		perform(get("/api/admin/cases/" + caseA + "/candidates"), adminToken)
			.andExpect(jsonPath("$[?(@.id == '%s')]".formatted(doctorId)).isEmpty());
		perform(post("/api/admin/cases/" + caseA + "/assignments").contentType(MediaType.APPLICATION_JSON)
			.content("{\"doctorId\":\"%s\"}".formatted(doctorId)), adminToken)
			.andExpect(jsonPath("$.code").value("doctor_not_active"));
		String intent = JsonPath.read(perform(post("/api/doctor/billing/checkout").contentType(MediaType.APPLICATION_JSON)
			.content("{\"feeType\":\"registration\"}"), doctorToken).andReturn().getResponse().getContentAsString(), "$.intentId");
		perform(post("/api/doctor/billing/simulate/" + intent), doctorToken).andExpect(status().isNoContent());

		// ── Cases and assignment ──────────────────────────────────────────
		perform(get("/api/admin/cases"), adminToken)
			.andExpect(jsonPath("$[?(@.id == '%s')].needsDoctor".formatted(caseA)).value(true));
		perform(get("/api/admin/cases/" + caseA + "/candidates"), adminToken)
			.andExpect(jsonPath("$[?(@.id == '%s')].matchesSpecialty".formatted(doctorId)).value(true));
		perform(post("/api/admin/cases/" + caseA + "/assignments").contentType(MediaType.APPLICATION_JSON)
			.content("{\"doctorId\":\"%s\"}".formatted(doctorId)), adminToken)
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.status").value("under_review"))
			.andExpect(jsonPath("$.assignments[0].doctorName").value("Dr. Ken Ito"))
			.andExpect(jsonPath("$.assignments[0].status").value("invited"));
		perform(post("/api/admin/cases/" + caseA + "/assignments").contentType(MediaType.APPLICATION_JSON)
			.content("{\"doctorId\":\"%s\"}".formatted(doctorId)), adminToken)
			.andExpect(jsonPath("$.code").value("already_assigned"));
		String detail = perform(get("/api/admin/cases/" + caseA), adminToken)
			.andExpect(jsonPath("$.patient.fullName").value("Ana Lopez"))
			.andExpect(jsonPath("$.documents.length()").value(1))
			.andReturn().getResponse().getContentAsString();
		perform(get("/api/admin/cases/" + caseA + "/documents/" + JsonPath.read(detail, "$.documents[0].id") + "/content"),
				adminToken)
			.andExpect(status().isOk());

		// ── Plans: publish one, decline another ───────────────────────────
		String planA = submitPlan(doctorToken, caseA, hospital.getId());
		perform(get("/api/admin/plans?status=submitted_to_iha"), adminToken)
			.andExpect(jsonPath("$[?(@.id == '%s')].doctorName".formatted(planA)).value("Dr. Ken Ito"));
		perform(get("/api/admin/plans/" + planA), adminToken)
			.andExpect(jsonPath("$.totalAud").value(13500.0))
			.andExpect(jsonPath("$.suggestedCommissionAud").value(1350.0))
			.andExpect(jsonPath("$.hospitalName").value("Admin Test Hospital"));
		perform(post("/api/admin/plans/" + planA + "/publish").contentType(MediaType.APPLICATION_JSON)
			.content("{\"mtaCommissionAud\":1400}"), adminToken)
			.andExpect(jsonPath("$.status").value("presented_to_patient"));
		assertThat(caseStatus(caseA)).isEqualTo("treatment_plan");
		perform(get("/api/patient/cases/" + caseA + "/treatment-options"), patientToken)
			.andExpect(jsonPath("$.length()").value(1))
			.andExpect(jsonPath("$[0].costBreakdown.items[?(@.label == 'IHA Service Fee')].amount").value(1400.0));
		perform(post("/api/admin/plans/" + planA + "/reject").contentType(MediaType.APPLICATION_JSON)
			.content("{\"reason\":\"Too late to decline now\"}"), adminToken)
			.andExpect(jsonPath("$.code").value("invalid_transition"));

		UUID caseB = submitCase(patientToken);
		perform(post("/api/admin/cases/" + caseB + "/assignments").contentType(MediaType.APPLICATION_JSON)
			.content("{\"doctorId\":\"%s\"}".formatted(doctorId)), adminToken)
			.andExpect(status().isCreated());
		String planB = submitPlan(doctorToken, caseB, hospital.getId());
		perform(post("/api/admin/plans/" + planB + "/reject").contentType(MediaType.APPLICATION_JSON)
			.content("{\"reason\":\"short\"}"), adminToken)
			.andExpect(jsonPath("$.code").value("reason_required"));
		perform(post("/api/admin/plans/" + planB + "/reject").contentType(MediaType.APPLICATION_JSON)
			.content("{\"reason\":\"Please add the anaesthetist fee and a recovery estimate.\"}"), adminToken)
			.andExpect(jsonPath("$.status").value("rejected_by_iha"));
		perform(get("/api/doctor/cases/" + caseB + "/treatment-plan"), doctorToken)
			.andExpect(jsonPath("$.status").value("rejected_by_iha"))
			.andExpect(jsonPath("$.rejectionReason").value("Please add the anaesthetist fee and a recovery estimate."));
		perform(get("/api/notifications"), doctorToken)
			.andExpect(jsonPath("$[0].title").value("Treatment plan not approved"));

		// ── Chats ──────────────────────────────────────────────────────────
		String patientThread = JsonPath.read(perform(get("/api/patient/chat"), patientToken).andReturn().getResponse()
			.getContentAsString(), "$.id");
		perform(post("/api/patient/chat/reopen-request").contentType(MediaType.APPLICATION_JSON)
			.content("{\"reason\":\"I have a question about my visa.\"}"), patientToken)
			.andExpect(status().isNoContent());
		perform(get("/api/admin/chats"), adminToken)
			.andExpect(jsonPath("$[?(@.id == '%s')].reopenReason".formatted(patientThread))
				.value("I have a question about my visa."));
		perform(post("/api/admin/chats/patient/" + patientThread + "/open"), adminToken)
			.andExpect(jsonPath("$.status").value("open"));
		perform(post("/api/admin/chats/patient/" + patientThread + "/messages").contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\":\"Hi Ana, happy to help.\"}"), adminToken)
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.messages.length()").value(1));
		perform(get("/api/patient/chat/unread-count"), patientToken).andExpect(jsonPath("$.count").value(1));
		perform(post("/api/patient/chat/messages").contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\":\"Thanks!\"}"), patientToken)
			.andExpect(status().isCreated());
		perform(get("/api/admin/chats"), adminToken)
			.andExpect(jsonPath("$[?(@.id == '%s')].unread".formatted(patientThread)).value(1));
		perform(get("/api/admin/chats/patient/" + patientThread), adminToken)
			.andExpect(jsonPath("$.messages.length()").value(2));
		perform(get("/api/admin/chats"), adminToken)
			.andExpect(jsonPath("$[?(@.id == '%s')].unread".formatted(patientThread)).value(0));
		perform(post("/api/admin/chats/patient/" + patientThread + "/close"), adminToken)
			.andExpect(jsonPath("$.status").value("closed"));

		String doctorThread = JsonPath.read(perform(get("/api/doctor/messages"), doctorToken).andReturn().getResponse()
			.getContentAsString(), "$.id");
		perform(post("/api/admin/chats/provider/" + doctorThread + "/open"), adminToken)
			.andExpect(jsonPath("$.accountType").value("doctor"))
			.andExpect(jsonPath("$.name").value("Dr. Ken Ito"));
		perform(post("/api/admin/chats/provider/" + doctorThread + "/messages").contentType(MediaType.APPLICATION_JSON)
			.content("{\"body\":\"Welcome to MTA, Dr. Ito.\"}"), adminToken)
			.andExpect(status().isCreated());
		perform(get("/api/notifications"), doctorToken)
			.andExpect(jsonPath("$[0].title").value("New message from MTA Admin"));
		perform(get("/api/admin/chats/other/" + doctorThread), adminToken).andExpect(status().isNotFound());

		perform(get("/api/admin/overview"), adminToken)
			.andExpect(jsonPath("$.totalCases").isNumber())
			.andExpect(jsonPath("$.recentCases.length()").value(6));

		// ── Dashboard insights and doctor performance ─────────────────────
		perform(get("/api/admin/insights"), patientToken).andExpect(status().isForbidden());
		String doctorStats = "$.doctors[?(@.id == '%s')]".formatted(doctorId);
		perform(get("/api/admin/insights"), adminToken)
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.pipeline.length()").value(7))
			.andExpect(jsonPath("$.platform.activeDoctors").isNumber())
			.andExpect(jsonPath("$.money.monthly.length()").value(12))
			.andExpect(jsonPath(doctorStats + ".activeCases").value(2))
			.andExpect(jsonPath(doctorStats + ".totalInvitations").value(2))
			.andExpect(jsonPath(doctorStats + ".invitationAcceptancePct").value(100))
			.andExpect(jsonPath(doctorStats + ".plansSubmitted").value(2))
			.andExpect(jsonPath(doctorStats + ".planChosenPct").value(0))
			.andExpect(jsonPath(doctorStats + ".feeStatus").value("paid"))
			.andExpect(jsonPath("$.specialties[?(@.specialty == 'Cardiology')].activeDoctors").isNotEmpty());
		perform(get("/api/admin/doctors/" + doctorId + "/performance"), adminToken)
			.andExpect(jsonPath("$.stats.fullName").value("Dr. Ken Ito"))
			.andExpect(jsonPath("$.membershipFeesPaidAud").value(org.hamcrest.Matchers.greaterThan(0.0)))
			.andExpect(jsonPath("$.cases.length()").value(2))
			.andExpect(jsonPath("$.cases[?(@.caseId == '%s')].planStatus".formatted(caseA)).value("presented_to_patient"))
			.andExpect(jsonPath("$.cases[?(@.caseId == '%s')].planStatus".formatted(caseB)).value("rejected_by_iha"))
			.andExpect(jsonPath("$.cases[?(@.caseId == '%s')].consultationSkippedReason".formatted(caseA))
				.value("Spoke with the patient by phone already."));
		perform(get("/api/admin/doctors/" + UUID.randomUUID() + "/performance"), adminToken)
			.andExpect(status().isNotFound());
	}

	private String admin() throws Exception {
		String email = "admin-" + UUID.randomUUID() + "@example.com";
		AppUser user = new AppUser(email, passwordEncoder.encode(PASSWORD), Role.ADMIN);
		user.markEmailVerified();
		users.save(user);
		return JsonPath.read(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, PASSWORD)))
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString(), "$.accessToken");
	}

	private UUID submitCase(String patientToken) throws Exception {
		String body = perform(multipart("/api/patient/cases")
			.file(new MockMultipartFile("files", "scan.pdf", "application/pdf", PDF))
			.param("documentTypes", "lab_report")
			.param("specialty", "Cardiology")
			.param("description", "Breathless on exertion for a year; local cardiologist suspects valve disease."),
				patientToken)
			.andExpect(status().isCreated())
			.andReturn().getResponse().getContentAsString();
		return UUID.fromString(JsonPath.read(body, "$.id"));
	}

	/** Doctor accepts, evaluates, skips the initial consultation and submits a plan; returns its id. */
	private String submitPlan(String doctorToken, UUID caseId, UUID hospitalId) throws Exception {
		String cases = perform(get("/api/doctor/cases"), doctorToken).andReturn().getResponse().getContentAsString();
		String assignmentId = JsonPath.<java.util.List<String>>read(cases,
				"$[?(@.caseId == '%s')].assignment.id".formatted(caseId)).get(0);
		perform(post("/api/doctor/assignments/" + assignmentId + "/respond").contentType(MediaType.APPLICATION_JSON)
			.content("{\"status\":\"accepted\"}"), doctorToken)
			.andExpect(status().isOk());
		perform(post("/api/doctor/cases/" + caseId + "/start-evaluation"), doctorToken).andExpect(status().isNoContent());
		perform(post("/api/doctor/cases/" + caseId + "/initial-consultation/skip").contentType(MediaType.APPLICATION_JSON)
			.content("{\"reason\":\"Spoke with the patient by phone already.\"}"), doctorToken)
			.andExpect(status().isNoContent());
		LocalDate start = LocalDate.now(ZoneId.of("Australia/Brisbane")).plusDays(30);
		String plan = perform(post("/api/doctor/cases/" + caseId + "/treatment-plan/submit")
			.contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"diagnosis":"Moderate aortic stenosis","treatmentType":"surgery","procedureName":"TAVI",
					 "treatmentStartDate":"%s","treatmentEndDate":"%s","estimatedLengthOfStay":"4 nights",
					 "hospitalId":"%s","doctorFeesAud":9000,"hospitalFeesAud":3000,
					 "costItems":[{"label":"Diagnostics & Lab","amount":1500}]}
					""".formatted(start, start.plusDays(5), hospitalId)), doctorToken)
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
		return JsonPath.read(plan, "$.planId");
	}

	private String verifyEmail(String email) throws Exception {
		ArgumentCaptor<String> code = ArgumentCaptor.forClass(String.class);
		org.mockito.Mockito.verify(codeSender, atLeastOnce()).send(eq(email), eq("verify_email"), code.capture());
		String body = mvc.perform(post("/api/auth/verify").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"code\":\"%s\"}".formatted(email, code.getValue())))
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
		return JsonPath.read(body, "$.accessToken");
	}

	private ResultActions perform(AbstractMockHttpServletRequestBuilder<?> request, String token) throws Exception {
		return mvc.perform(request.header("Authorization", "Bearer " + token));
	}

	private String caseStatus(UUID caseId) {
		return jdbc.queryForObject("select status from cases where id = ?", String.class, caseId);
	}

}
