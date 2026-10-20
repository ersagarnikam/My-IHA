package com.iha;

import java.nio.charset.StandardCharsets;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.UUID;

import com.iha.auth.VerificationCodeSender;
import com.iha.doctor.DoctorAdminService;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorRepository;
import com.iha.provider.Hospital;
import com.iha.provider.HospitalRepository;
import com.iha.providerchat.ProviderAccount;
import com.iha.providerchat.ProviderMessageService;
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
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.multipart;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * The doctor journey through HTTP: sign-up, registration, approval gate,
 * registration fee, case invitation through to a submitted plan, consultation
 * times, document requests, support chat and settings. MTA admin steps go
 * through {@link DoctorAdminService} (the admin portal isn't ported yet).
 */
@SpringBootTest
@AutoConfigureMockMvc
class DoctorPortalFlowTests {

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
	DoctorRepository doctors;

	@Autowired
	HospitalRepository hospitals;

	@Autowired
	DoctorAdminService admin;

	@Autowired
	ProviderMessageService providerMessages;

	@MockitoBean
	VerificationCodeSender codeSender;

	@Test
	void doctorJourney() throws Exception {
		Hospital hospital = hospitals.save(withRooms(new Hospital(null, "Test General", "Brisbane", "Australia")));
		Hospital other = hospitals.save(withRooms(new Hospital(null, "Other Private", "Sydney", "Australia")));

		// ── Sign-up, then the registration wizard ─────────────────────────
		String email = "doc-" + UUID.randomUUID() + "@example.com";
		mvc.perform(post("/api/auth/register/doctor").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, PASSWORD)))
			.andExpect(status().isAccepted());
		String doctorToken = verifyEmail(email);
		perform(get("/api/doctor/account"), doctorToken).andExpect(jsonPath("$.registered").value(false));
		perform(get("/api/doctor/cases"), doctorToken).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("doctor_profile_missing"));

		perform(registration(multipart("/api/doctor/registration"), hospital.getId()).param("licenseNumber", "MED123"),
				doctorToken)
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("invalid_license_number"));
		perform(registration(multipart("/api/doctor/registration"), hospital.getId())
			.file(new MockMultipartFile("medicalLicense", "license.pdf", "application/pdf", PDF))
			.file(new MockMultipartFile("degreeCertificate", "degree.pdf", "application/pdf", PDF)), doctorToken)
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.status").value("pending"))
			.andExpect(jsonPath("$.licenseNumber").value("MED0001234560"))
			.andExpect(jsonPath("$.documents.length()").value(2))
			.andExpect(jsonPath("$.availability[0].enabled").value(true))
			.andExpect(jsonPath("$.availability[5].enabled").value(false));
		Doctor doctor = doctors.findAll().stream().filter(d -> email.equals(d.getContactEmail())).findFirst().orElseThrow();

		// Gate: nothing past the account page until approved and paid.
		perform(get("/api/doctor/cases"), doctorToken).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("doctor_not_approved"));
		perform(post("/api/doctor/billing/checkout").contentType(MediaType.APPLICATION_JSON)
			.content("{\"feeType\":\"registration\"}"), doctorToken)
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("not_approved"));

		// Admin asks for more info; the doctor resubmits (documents kept) and is approved.
		admin.review(doctor.getId(), Doctor.MORE_INFO_REQUESTED, "Clearer licence copy please.");
		perform(get("/api/doctor/account"), doctorToken)
			.andExpect(jsonPath("$.doctor.status").value("more_info_requested"))
			.andExpect(jsonPath("$.doctor.moreInfoMessage").value("Clearer licence copy please."));
		perform(registration(multipart(HttpMethod.PUT, "/api/doctor/registration"), hospital.getId())
			.file(new MockMultipartFile("medicalLicense", "license-v2.pdf", "application/pdf", PDF)), doctorToken)
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("pending"))
			.andExpect(jsonPath("$.documents.length()").value(2))
			.andExpect(jsonPath("$.documents[0].fileName").value("license-v2.pdf"));
		admin.review(doctor.getId(), Doctor.APPROVED, null);

		// Registration fee (simulated provider) unlocks the portal.
		perform(get("/api/doctor/cases"), doctorToken).andExpect(jsonPath("$.code").value("registration_fee_unpaid"));
		String checkout = perform(post("/api/doctor/billing/checkout").contentType(MediaType.APPLICATION_JSON)
			.content("{\"feeType\":\"registration\"}"), doctorToken)
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.amountAud").value(5000.0))
			.andReturn().getResponse().getContentAsString();
		String intentId = JsonPath.read(checkout, "$.intentId");
		perform(post("/api/doctor/billing/simulate/" + intentId), doctorToken).andExpect(status().isNoContent());
		perform(get("/api/doctor/billing"), doctorToken)
			.andExpect(jsonPath("$.registrationFeePaidAt").exists())
			.andExpect(jsonPath("$.annualFeeDue").value(false))
			.andExpect(jsonPath("$.payments[0].status").value("completed"));
		String paymentId = JsonPath.read(perform(get("/api/doctor/billing"), doctorToken).andReturn().getResponse()
			.getContentAsString(), "$.payments[0].id");
		perform(get("/api/doctor/billing/payments/" + paymentId + "/invoice"), doctorToken)
			.andExpect(status().isOk());
		perform(post("/api/doctor/billing/checkout").contentType(MediaType.APPLICATION_JSON)
			.content("{\"feeType\":\"annual\"}"), doctorToken)
			.andExpect(jsonPath("$.code").value("not_due_yet"));
		perform(get("/api/doctor/cases"), doctorToken).andExpect(status().isOk());

		// ── A patient submits a case; admin invites the doctor ────────────
		String patientEmail = "pat-" + UUID.randomUUID() + "@example.com";
		mvc.perform(post("/api/auth/register/patient").contentType(MediaType.APPLICATION_JSON)
			.content("{\"fullName\":\"Wei Zhang\",\"email\":\"%s\",\"password\":\"%s\"}".formatted(patientEmail, PASSWORD)))
			.andExpect(status().isAccepted());
		String patientToken = verifyEmail(patientEmail);
		String caseJson = perform(multipart("/api/patient/cases")
			.file(new MockMultipartFile("files", "scan.pdf", "application/pdf", PDF))
			.param("documentTypes", "lab_report")
			.param("specialty", "Cardiology")
			.param("description", "Chest tightness on exertion for six months; echocardiogram shows moderate aortic stenosis."),
				patientToken)
			.andExpect(status().isCreated())
			.andReturn().getResponse().getContentAsString();
		UUID caseId = UUID.fromString(JsonPath.read(caseJson, "$.id"));
		UUID assignmentId = admin.assignCase(caseId, doctor.getId()).getId();
		assertThat(caseStatus(caseId)).isEqualTo("under_review");
		perform(get("/api/notifications"), doctorToken)
			.andExpect(jsonPath("$[0].title").value("New case assigned to you"))
			.andExpect(jsonPath("$[0].message").value("MTA Admin assigned you a new case (Cardiology)."));

		perform(get("/api/doctor/cases"), doctorToken)
			.andExpect(jsonPath("$.length()").value(1))
			.andExpect(jsonPath("$[0].patientName").value("Wei Zhang"))
			.andExpect(jsonPath("$[0].assignment.status").value("invited"));

		// Another doctor can't see it.
		String strangerToken = activeDoctor(hospital);
		perform(get("/api/doctor/cases/" + caseId), strangerToken).andExpect(status().isNotFound());

		// Accept → doctor_assigned; start evaluation → evaluation.
		perform(post("/api/doctor/assignments/" + assignmentId + "/respond").contentType(MediaType.APPLICATION_JSON)
			.content("{\"status\":\"accepted\"}"), doctorToken)
			.andExpect(jsonPath("$.status").value("accepted"));
		perform(post("/api/doctor/assignments/" + assignmentId + "/respond").contentType(MediaType.APPLICATION_JSON)
			.content("{\"status\":\"declined\"}"), doctorToken)
			.andExpect(status().isConflict());
		assertThat(caseStatus(caseId)).isEqualTo("doctor_assigned");
		perform(post("/api/doctor/cases/" + caseId + "/document-requests").contentType(MediaType.APPLICATION_JSON)
			.content("{\"documentTypes\":[\"xray\"]}"), doctorToken)
			.andExpect(jsonPath("$.code").value("case_not_in_evaluation"));
		perform(post("/api/doctor/cases/" + caseId + "/start-evaluation"), doctorToken).andExpect(status().isNoContent());
		assertThat(caseStatus(caseId)).isEqualTo("evaluation");

		// Case detail shows the patient's documents, which the doctor can open.
		String detail = perform(get("/api/doctor/cases/" + caseId), doctorToken)
			.andExpect(jsonPath("$.patient.fullName").value("Wei Zhang"))
			.andExpect(jsonPath("$.documents.length()").value(1))
			.andExpect(jsonPath("$.assignment.evaluationStartedAt").exists())
			.andReturn().getResponse().getContentAsString();
		String documentId = JsonPath.read(detail, "$.documents[0].id");
		perform(get("/api/doctor/cases/" + caseId + "/documents/" + documentId + "/content"), doctorToken)
			.andExpect(status().isOk());
		perform(get("/api/doctor/cases/" + caseId + "/documents/" + documentId + "/content"), strangerToken)
			.andExpect(status().isNotFound());

		// ── Document requests: tracked until the patient uploads that type ──
		perform(post("/api/doctor/cases/" + caseId + "/document-requests").contentType(MediaType.APPLICATION_JSON)
			.content("{\"documentTypes\":[\"xray\",\"prescription\"],\"message\":\"Recent ones please.\"}"),
				doctorToken)
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.length()").value(2));
		perform(get("/api/notifications"), patientToken)
			.andExpect(jsonPath("$[0].title").value("Your doctor requested additional documents"));
		perform(multipart("/api/patient/cases/" + caseId + "/documents")
			.file(new MockMultipartFile("files", "xray.pdf", "application/pdf", PDF))
			.param("documentTypes", "xray"), patientToken)
			.andExpect(status().isCreated());
		perform(get("/api/doctor/cases/" + caseId), doctorToken)
			.andExpect(jsonPath("$.documentRequests[?(@.documentType == 'xray')].status").value("received"))
			.andExpect(jsonPath("$.documentRequests[?(@.documentType == 'prescription')].status").value("pending"));

		// ── Treatment plan: drafts are partial; submit checks required fields ──
		LocalDate start = LocalDate.now(ZoneId.of("Australia/Brisbane")).plusDays(30);
		perform(put("/api/doctor/cases/" + caseId + "/treatment-plan").contentType(MediaType.APPLICATION_JSON)
			.content("{\"diagnosis\":\"Aortic\",\"hospitalId\":\"%s\"}".formatted(other.getId())), doctorToken)
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fieldErrors.hospitalId").exists());
		perform(put("/api/doctor/cases/" + caseId + "/treatment-plan").contentType(MediaType.APPLICATION_JSON)
			.content("{\"diagnosis\":\"Aortic\",\"costItems\":[{\"label\":\"Surgery Charge\",\"amount\":4000}],"
					+ "\"specialists\":[{\"specialistType\":\"anaesthetist\",\"costAud\":1200}]}"), doctorToken)
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("draft"))
			.andExpect(jsonPath("$.costItems[0].label").value("Surgery Charge"))
			.andExpect(jsonPath("$.specialists.length()").value(1))
			.andExpect(jsonPath("$.hospitals.length()").value(1));
		perform(post("/api/doctor/cases/" + caseId + "/treatment-plan/submit").contentType(MediaType.APPLICATION_JSON)
			.content("{\"diagnosis\":\"Aortic\"}"), doctorToken)
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fieldErrors.diagnosis").exists())
			.andExpect(jsonPath("$.fieldErrors.hospitalId").exists());
		String plan = """
				{"diagnosis":"Severe aortic stenosis","treatmentType":"surgery","procedureName":"TAVI",
				 "treatmentStartDate":"%s","treatmentEndDate":"%s","estimatedLengthOfStay":"5 nights",
				 "hospitalId":"%s","roomCategory":"Private","doctorFeesAud":18000,"hospitalFeesAud":9000,
				 "costItems":[{"label":"Surgery Charge","amount":4000}],"aftercare":["Rest"," ",""],
				 "specialists":[{"specialistType":"anaesthetist","costAud":1200}]}
				""".formatted(start, start.plusDays(6), hospital.getId());
		perform(post("/api/doctor/cases/" + caseId + "/treatment-plan/submit").contentType(MediaType.APPLICATION_JSON)
			.content(plan), doctorToken)
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("submitted_to_iha"))
			.andExpect(jsonPath("$.treatmentDurationDays").value(7))
			.andExpect(jsonPath("$.aftercare.length()").value(1));
		perform(put("/api/doctor/cases/" + caseId + "/treatment-plan").contentType(MediaType.APPLICATION_JSON)
			.content(plan), doctorToken)
			.andExpect(status().isConflict());
		perform(get("/api/doctor/cases"), doctorToken)
			.andExpect(jsonPath("$[0].assignment.planSubmittedAt").exists())
			.andExpect(jsonPath("$[0].planStatus").value("submitted_to_iha"));

		// ── Admin publishes; patient asks for a consultation ──────────────
		UUID planId = UUID.fromString(JsonPath.read(perform(get("/api/doctor/cases/" + caseId + "/treatment-plan"),
				doctorToken).andReturn().getResponse().getContentAsString(), "$.planId"));
		UUID optionId = admin.publishPlan(planId, new java.math.BigDecimal("1500")).getId();
		assertThat(caseStatus(caseId)).isEqualTo("treatment_plan");
		String consultation = perform(post("/api/patient/treatment-options/" + optionId + "/consultation"),
				patientToken)
			.andExpect(status().is2xxSuccessful())
			.andReturn().getResponse().getContentAsString();
		UUID requestId = UUID.fromString(JsonPath.read(consultation, "$.id"));
		perform(get("/api/doctor/consultations"), doctorToken)
			.andExpect(jsonPath("$[0].id").value(requestId.toString()))
			.andExpect(jsonPath("$[0].procedureName").value("TAVI"))
			.andExpect(jsonPath("$[0].status").value("requested"));
		perform(get("/api/doctor/consultations/" + requestId), strangerToken).andExpect(status().isNotFound());

		LocalDate day = start.minusDays(10);
		perform(post("/api/doctor/consultations/" + requestId + "/slots").contentType(MediaType.APPLICATION_JSON)
			.content("{\"slots\":[{\"date\":\"%s\",\"startTime\":\"10:00\",\"endTime\":\"09:30\"}]}".formatted(day)),
				doctorToken)
			.andExpect(jsonPath("$.code").value("slot_end_before_start"));
		perform(post("/api/doctor/consultations/" + requestId + "/slots").contentType(MediaType.APPLICATION_JSON)
			.content("{\"slots\":[{\"date\":\"%s\",\"startTime\":\"10:00\",\"endTime\":\"10:30\"}]}"
				.formatted(start.plusDays(1))), doctorToken)
			.andExpect(jsonPath("$.code").value("slot_after_treatment"));
		perform(post("/api/doctor/consultations/" + requestId + "/slots").contentType(MediaType.APPLICATION_JSON)
			.content("{\"slots\":[{\"date\":\"%s\",\"startTime\":\"10:00\",\"endTime\":\"10:30\"},{\"date\":\"%s\",\"startTime\":\"14:00\",\"endTime\":\"14:30\"}]}"
				.formatted(day, day.plusDays(1))), doctorToken)
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("slots_proposed"))
			.andExpect(jsonPath("$.slots.length()").value(2))
			// 10:00 in Brisbane (UTC+10, no daylight saving) is midnight UTC.
			.andExpect(jsonPath("$.slots[0].slotTime").value(day + "T00:00:00Z"));
		perform(get("/api/notifications"), patientToken)
			.andExpect(jsonPath("$[0].title").value("Consultation slots proposed"));
		perform(post("/api/doctor/consultations/" + requestId + "/cancel").contentType(MediaType.APPLICATION_JSON)
			.content("{\"reason\":\"no\"}"), doctorToken)
			.andExpect(jsonPath("$.code").value("reason_required"));
		perform(post("/api/doctor/consultations/" + requestId + "/cancel").contentType(MediaType.APPLICATION_JSON)
			.content("{\"reason\":\"Travelling that week\"}"), doctorToken)
			.andExpect(jsonPath("$.status").value("cancelled"));

		// Completion only once the case is paid and the treatment window is over.
		perform(post("/api/doctor/cases/" + caseId + "/complete"), doctorToken)
			.andExpect(jsonPath("$.code").value("invalid_transition"));
		jdbc.update("update cases set status = 'travel_ready' where id = ?", caseId);
		perform(post("/api/doctor/cases/" + caseId + "/complete"), doctorToken)
			.andExpect(jsonPath("$.code").value("treatment_not_finished"));
		jdbc.update("update treatment_plans set treatment_end_date = ? where id = ?", LocalDate.now().minusDays(1),
				planId);
		perform(post("/api/doctor/cases/" + caseId + "/complete"), doctorToken).andExpect(status().isNoContent());
		assertThat(caseStatus(caseId)).isEqualTo("completed");

		// ── Support chat ───────────────────────────────────────────────────
		perform(post("/api/doctor/messages").contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"Hi\"}"),
				doctorToken)
			.andExpect(jsonPath("$.code").value("thread_closed"));
		UUID threadId = providerMessages
			.ensureThread(new ProviderAccount(ProviderAccount.DOCTOR, doctor.getId(), doctor.getUserId()))
			.getId();
		providerMessages.open(threadId);
		providerMessages.sendAsAdmin(threadId, doctor.getUserId(), doctor.getUserId(), "Welcome aboard");
		perform(get("/api/doctor/messages/unread-count"), doctorToken).andExpect(jsonPath("$.count").value(1));
		perform(post("/api/doctor/messages").contentType(MediaType.APPLICATION_JSON).content("{\"body\":\"Thanks\"}"),
				doctorToken)
			.andExpect(status().isCreated());
		perform(post("/api/doctor/messages/read"), doctorToken).andExpect(status().isNoContent());
		perform(get("/api/doctor/messages"), doctorToken)
			.andExpect(jsonPath("$.messages.length()").value(2))
			.andExpect(jsonPath("$.unread").value(0));

		// ── Settings ───────────────────────────────────────────────────────
		perform(put("/api/doctor/profile/personal").contentType(MediaType.APPLICATION_JSON)
			.content("{\"fullName\":\"Dr. Test\",\"contactPhone\":\"+61412345678\",\"dateOfBirth\":\"1980-01-01\",\"gender\":\"female\"}"),
				doctorToken)
			.andExpect(jsonPath("$.fullName").value("Dr. Test"))
			.andExpect(jsonPath("$.dateOfBirth").value("1980-01-01"));
		String week = """
				[{"day":"monday","enabled":true,"start_time":"09:00","end_time":"17:00"},
				 {"day":"tuesday","enabled":false,"start_time":"09:00","end_time":"17:00"},
				 {"day":"wednesday","enabled":true,"start_time":"10:00","end_time":"%s"},
				 {"day":"thursday","enabled":false,"start_time":"09:00","end_time":"17:00"},
				 {"day":"friday","enabled":false,"start_time":"09:00","end_time":"17:00"},
				 {"day":"saturday","enabled":false,"start_time":"09:00","end_time":"17:00"},
				 {"day":"sunday","enabled":false,"start_time":"09:00","end_time":"17:00"}]
				""";
		perform(put("/api/doctor/profile/availability").contentType(MediaType.APPLICATION_JSON)
			.content(week.formatted("09:00")), doctorToken)
			.andExpect(jsonPath("$.code").value("invalid_hours"));
		perform(put("/api/doctor/profile/availability").contentType(MediaType.APPLICATION_JSON)
			.content(week.formatted("15:00")), doctorToken)
			.andExpect(jsonPath("$.workingDays.length()").value(2))
			.andExpect(jsonPath("$.availability[2].start_time").value("10:00"));
		assertThat(jdbc.queryForObject("select license_number_enc from doctors where id = ?", String.class,
				doctor.getId())).doesNotContain("MED");
	}

	private MockMultipartHttpServletRequestBuilder registration(MockMultipartHttpServletRequestBuilder builder,
			UUID hospitalId) {
		builder.param("fullName", "Dr. Jane Smith")
			.param("contactPhone", "+61412345678")
			.param("specialties", "Cardiology")
			.param("qualifications", "MBBS, FRACP")
			.param("yearsOfExperience", "12")
			.param("licenseNumber", "med0001234560")
			.param("bio", "Interventional cardiologist.")
			.param("languagesSpoken", "English", "Hindi")
			.param("department", "Cardiology")
			.param("role", "consultant")
			.param("hospitalIds", hospitalId.toString())
			.param("workingDays", "mon", "tue", "wed", "thu", "fri");
		return builder;
	}

	/** A second, fully active doctor (used to check other doctors' cases are hidden). */
	private String activeDoctor(Hospital hospital) throws Exception {
		String email = "doc-" + UUID.randomUUID() + "@example.com";
		mvc.perform(post("/api/auth/register/doctor").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, PASSWORD)))
			.andExpect(status().isAccepted());
		String token = verifyEmail(email);
		perform(registration(multipart("/api/doctor/registration"), hospital.getId())
			.file(new MockMultipartFile("medicalLicense", "license.pdf", "application/pdf", PDF))
			.file(new MockMultipartFile("degreeCertificate", "degree.pdf", "application/pdf", PDF)), token)
			.andExpect(status().isCreated());
		Doctor doctor = doctors.findAll().stream().filter(d -> email.equals(d.getContactEmail())).findFirst().orElseThrow();
		admin.review(doctor.getId(), Doctor.APPROVED, null);
		String intent = JsonPath.read(perform(post("/api/doctor/billing/checkout").contentType(MediaType.APPLICATION_JSON)
			.content("{\"feeType\":\"registration\"}"), token).andReturn().getResponse().getContentAsString(), "$.intentId");
		perform(post("/api/doctor/billing/simulate/" + intent), token).andExpect(status().isNoContent());
		return token;
	}

	private static Hospital withRooms(Hospital hospital) {
		hospital.setRoomTypes(new String[] { "Standard", "Private" });
		return hospital;
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
