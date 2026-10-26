package com.iha;

import java.math.BigDecimal;
import java.math.RoundingMode;
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
 * Admin refunds: access, validation, partial then full refunds with the card
 * fee deducted once, what patients and doctors see, credit notes, the
 * dashboard, and a refunded consultation being cancelled.
 */
@SpringBootTest
@AutoConfigureMockMvc
class RefundTests {

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
	void partialThenFullRefundOfATreatmentPayment() throws Exception {
		String admin = adminToken();
		String patient = login("patient@demo.local", "Demo1234");
		perform(get("/api/admin/payments"), patient).andExpect(status().isForbidden());

		// The demo patient's paid treatments.
		String list = perform(get("/api/admin/payments"), admin).andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
		assertThat(JsonPath.<List<String>>read(list, "$[?(@.kind == 'doctor')].type")).contains("registration");
		List<Map<String, Object>> treatments = JsonPath.read(list,
				"$[?(@.payerName == 'Demo Patient' && @.type == 'treatment' && @.status == 'completed' && @.refundCount == 0)]");
		assertThat(treatments).isNotEmpty();
		String paymentId = (String) treatments.get(0).get("id");
		BigDecimal amount = new BigDecimal(treatments.get(0).get("amountAud").toString());
		String path = "/api/admin/payments/patient/" + paymentId;

		// Fee estimate from the settings: 1.75% + A$0.30.
		BigDecimal fee = amount.multiply(new BigDecimal("0.0175")).add(new BigDecimal("0.30"))
			.setScale(2, RoundingMode.HALF_UP);
		perform(get(path), admin)
			.andExpect(jsonPath("$.quote.refundableAud").value(amount.doubleValue()))
			.andExpect(jsonPath("$.quote.feeAud").value(fee.doubleValue()))
			.andExpect(jsonPath("$.quote.feeSource").value("estimate"))
			.andExpect(jsonPath("$.reasons.visa_refused").value("Visa refused"));
		double insightsBefore = treatmentMoney(admin);

		// ── Validation ─────────────────────────────────────────────────────
		refund(admin, path, amount.add(BigDecimal.ONE).toPlainString(), "visa_refused", null, false)
			.andExpect(jsonPath("$.code").value("amount_too_high"));
		refund(admin, path, "0", "visa_refused", null, false).andExpect(jsonPath("$.code").value("invalid_amount"));
		refund(admin, path, "10.001", "visa_refused", null, false).andExpect(jsonPath("$.code").value("invalid_amount"));
		refund(admin, path, "100", "because", null, false).andExpect(jsonPath("$.code").value("invalid_reason"));
		refund(admin, path, "100", "other", null, false).andExpect(jsonPath("$.code").value("note_required"));
		refund(admin, path, "0.20", "goodwill", null, false).andExpect(jsonPath("$.code").value("refund_below_fee"));
		refund(admin, "/api/admin/payments/other/" + paymentId, "100", "goodwill", null, false)
			.andExpect(status().isNotFound());

		// ── Partial refund: the whole card fee comes off this one ──────────
		refund(admin, path, "1000", "visa_refused", "Visa refused on 12 Oct", false)
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.payment.status").value("completed"))
			.andExpect(jsonPath("$.refunds[0].amountAud").value(1000.0))
			.andExpect(jsonPath("$.refunds[0].feeDeductedAud").value(fee.doubleValue()))
			.andExpect(jsonPath("$.refunds[0].refundedAud").value(new BigDecimal("1000").subtract(fee).doubleValue()))
			.andExpect(jsonPath("$.refunds[0].status").value("succeeded"))
			.andExpect(jsonPath("$.refunds[0].createdBy").value(org.hamcrest.Matchers.startsWith("admin-")))
			.andExpect(jsonPath("$.quote.refundableAud").value(amount.subtract(new BigDecimal("1000")).doubleValue()))
			.andExpect(jsonPath("$.quote.feeRemainingAud").value(0.0));
		String firstNet = aud(new BigDecimal("1000").subtract(fee));
		String refundTitle = "Refund of " + firstNet + " issued";
		perform(get("/api/notifications?limit=200"), patient)
			.andExpect(jsonPath("$[?(@.title == '%s')].message".formatted(refundTitle))
				.value(org.hamcrest.Matchers.contains(org.hamcrest.Matchers.containsString("card processing fee"))));

		// What the patient sees, and the credit note.
		String history = perform(get("/api/patient/payments"), patient).andReturn().getResponse().getContentAsString();
		String refundId = JsonPath.<List<String>>read(history, "$[?(@.id == '%s')].refunds[0].id".formatted(paymentId))
			.get(0);
		assertThat(JsonPath.<List<Double>>read(history, "$[?(@.id == '%s')].refundedAud".formatted(paymentId)))
			.containsExactly(new BigDecimal("1000").subtract(fee).doubleValue());
		byte[] pdf = perform(get("/api/patient/refunds/" + refundId + "/credit-note"), patient)
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsByteArray();
		assertThat(new String(pdf, 0, 4, StandardCharsets.US_ASCII)).isEqualTo("%PDF");
		perform(get("/api/patient/payments/" + paymentId + "/invoice"), patient).andExpect(status().isOk());

		// ── Refund the rest: no second fee; the payment becomes refunded ────
		BigDecimal rest = amount.subtract(new BigDecimal("1000"));
		refund(admin, path, rest.toPlainString(), "treatment_not_possible", null, false)
			.andExpect(jsonPath("$.payment.status").value("refunded"))
			.andExpect(jsonPath("$.refunds[1].feeDeductedAud").value(0.0))
			.andExpect(jsonPath("$.refunds[1].feeSource").value("none"))
			.andExpect(jsonPath("$.quote.refundableAud").value(0.0));
		refund(admin, path, "1", "goodwill", null, false).andExpect(jsonPath("$.code").value("amount_too_high"));
		// Invoices stay available after a refund; the dashboard counts money net of refunds.
		perform(get("/api/patient/payments/" + paymentId + "/invoice"), patient).andExpect(status().isOk());
		assertThat(treatmentMoney(admin)).isLessThan(insightsBefore);
		assertThat(jdbc.queryForObject("select count(*) from audit_logs where action = 'payment.refunded' and entity_id = ?",
				Long.class, paymentId)).isEqualTo(2);
	}

	@Test
	void refundingAnUpcomingConsultationCancelsIt() throws Exception {
		String admin = adminToken();
		String patient = newPatient();
		String other = newPatient();
		String created = perform(multipart("/api/patient/cases")
			.file(new MockMultipartFile("files", "scan.pdf", "application/pdf", PDF))
			.param("documentTypes", "lab_report")
			.param("specialty", "Cardiology")
			.param("description", "Chest pain on exertion for six months; stress test was abnormal last week."), patient)
			.andExpect(status().isCreated())
			.andReturn().getResponse().getContentAsString();
		String caseId = JsonPath.read(created, "$.id");
		perform(post("/api/dev/cases/" + caseId + "/treatment-options"), patient).andExpect(status().isOk());
		String optionId = JsonPath.read(perform(get("/api/patient/cases/" + caseId + "/treatment-options"), patient)
			.andReturn().getResponse().getContentAsString(), "$[0].id");
		String requestId = JsonPath.read(perform(post("/api/patient/treatment-options/" + optionId + "/consultation"),
				patient).andReturn().getResponse().getContentAsString(), "$.id");
		perform(post("/api/dev/consultations/" + requestId + "/propose-slots"), patient).andExpect(status().isOk());
		String slotId = JsonPath.read(perform(get("/api/patient/consultations/" + requestId), patient)
			.andReturn().getResponse().getContentAsString(), "$.slots[0].id");
		perform(post("/api/patient/consultations/" + requestId + "/select-slot").contentType(MediaType.APPLICATION_JSON)
			.content("{\"slotId\":\"" + slotId + "\"}"), patient).andExpect(status().isOk());
		String intent = JsonPath.read(perform(post("/api/patient/consultations/" + requestId + "/checkout"), patient)
			.andReturn().getResponse().getContentAsString(), "$.intentId");
		perform(post("/api/patient/payments/simulate/" + intent), patient).andExpect(status().isNoContent());
		perform(get("/api/patient/consultations/" + requestId), patient).andExpect(jsonPath("$.status").value("scheduled"));

		String payments = perform(get("/api/admin/payments?caseId=" + caseId), admin).andReturn().getResponse()
			.getContentAsString();
		String paymentId = JsonPath.read(payments, "$[0].id");
		assertThat(JsonPath.<String>read(payments, "$[0].type")).isEqualTo("consultation");

		// The doctor cancelled: no card fee is kept (no waiver needed), so the patient gets the full A$200 back.
		refund(admin, "/api/admin/payments/patient/" + paymentId, "200", "doctor_cancelled", null, false)
			.andExpect(jsonPath("$.payment.status").value("refunded"))
			.andExpect(jsonPath("$.refunds[0].feeDeductedAud").value(0.0))
			.andExpect(jsonPath("$.refunds[0].feeSource").value("waived"))
			.andExpect(jsonPath("$.refunds[0].refundedAud").value(200.0));
		perform(get("/api/patient/consultations/" + requestId), patient)
			.andExpect(jsonPath("$.status").value("cancelled"))
			.andExpect(jsonPath("$.cancellationReason").value(org.hamcrest.Matchers.startsWith("Refunded by MTA")))
			.andExpect(jsonPath("$.feeAud").value(200.0));

		// Another patient can't download this credit note.
		String refundId = JsonPath.read(perform(get("/api/admin/payments/patient/" + paymentId), admin)
			.andReturn().getResponse().getContentAsString(), "$.refunds[0].id");
		perform(get("/api/patient/refunds/" + refundId + "/credit-note"), other).andExpect(status().isNotFound());
		perform(get("/api/patient/refunds/" + refundId + "/credit-note"), patient).andExpect(status().isOk());
	}

	@Test
	void doctorFeesCanBeRefundedToo() throws Exception {
		String admin = adminToken();
		String doctor = login("peer1@demo.local", "Demo1234");
		String billing = perform(get("/api/doctor/billing"), doctor).andReturn().getResponse().getContentAsString();
		String paymentId = JsonPath.<List<String>>read(billing, "$.payments[?(@.feeType == 'registration')].id").get(0);
		refund(admin, "/api/admin/payments/doctor/" + paymentId, "500", "goodwill", null, false)
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.payment.type").value("registration"))
			.andExpect(jsonPath("$.payment.status").value("completed"));
		perform(get("/api/doctor/billing"), doctor)
			.andExpect(jsonPath("$.payments[?(@.id == '%s')].refundedAud".formatted(paymentId))
				.value(org.hamcrest.Matchers.contains(org.hamcrest.Matchers.lessThan(500.0))));
		perform(get("/api/notifications?limit=200"), doctor)
			.andExpect(jsonPath("$[?(@.type == 'refund_issued')]").isNotEmpty());
	}

	// ── helpers ───────────────────────────────────────────────────────────

	private double treatmentMoney(String admin) throws Exception {
		return ((Number) JsonPath.read(perform(get("/api/admin/insights"), admin).andReturn().getResponse()
			.getContentAsString(), "$.money.treatmentPaymentsAud")).doubleValue();
	}

	private ResultActions refund(String token, String path, String amount, String reason, String note, boolean waive)
			throws Exception {
		String body = "{\"amountAud\":%s,\"reason\":\"%s\"%s,\"waiveFee\":%s}".formatted(amount, reason,
				note == null ? "" : ",\"note\":\"" + note + "\"", waive);
		return perform(post(path + "/refunds").contentType(MediaType.APPLICATION_JSON).content(body), token);
	}

	private static String aud(BigDecimal amount) {
		return "A" + java.text.NumberFormat.getCurrencyInstance(java.util.Locale.forLanguageTag("en-AU")).format(amount);
	}

	private String adminToken() throws Exception {
		String email = "admin-" + UUID.randomUUID() + "@example.com";
		AppUser user = new AppUser(email, passwordEncoder.encode(PASSWORD), Role.ADMIN);
		user.markEmailVerified();
		users.save(user);
		return login(email, PASSWORD);
	}

	private String newPatient() throws Exception {
		String email = "ref-" + UUID.randomUUID() + "@example.com";
		mvc.perform(post("/api/auth/register/patient").contentType(MediaType.APPLICATION_JSON)
			.content("{\"fullName\":\"Refund Patient\",\"email\":\"%s\",\"password\":\"%s\",\"acceptTerms\":true,\"consentHealthInfo\":true}".formatted(email, PASSWORD)))
			.andExpect(status().isAccepted());
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
