package com.iha;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import com.iha.auth.AppUser;
import com.iha.auth.AppUserRepository;
import com.iha.auth.Role;
import com.iha.hospital.HospitalAdminService;
import com.iha.lawyer.LawyerAdminService;
import com.iha.provider.Hospital;
import com.iha.provider.HospitalRepository;
import com.iha.provider.Lawyer;
import com.iha.provider.LawyerRepository;
import com.iha.verification.ProviderVerification;
import com.iha.verification.VerificationService;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Hospital and visa lawyer membership fees: a 0 fee is waived at approval, a
 * registration fee above 0 locks the portal until paid, the annual renewal is a
 * reminder only, and MTA sees and refunds the payments like doctors' fees.
 */
@SpringBootTest
@AutoConfigureMockMvc
class ProviderFeeTests {

	private static final String PASSWORD = "Secret123";

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

	@Autowired
	LawyerRepository lawyers;

	@Autowired
	HospitalAdminService hospitalAdmin;

	@Autowired
	LawyerAdminService lawyerAdmin;

	@Autowired
	VerificationService verification;

	/** Tests share one database: put the fees back to 0 for the other test classes. */
	@AfterEach
	void resetFees() {
		setFee("hospital_registration_fee", BigDecimal.ZERO);
		setFee("hospital_annual_fee", BigDecimal.ZERO);
		setFee("lawyer_registration_fee", BigDecimal.ZERO);
		setFee("lawyer_annual_fee", BigDecimal.ZERO);
	}

	@Test
	void zeroFeeIsWaivedAtApproval() throws Exception {
		String email = "hosp-free-" + UUID.randomUUID() + "@example.com";
		UUID hospitalId = approvedHospital(email);
		String token = login(email);

		perform(get("/api/hospital/account"), token)
			.andExpect(jsonPath("$.membership.registrationFeeDue").value(false))
			.andExpect(jsonPath("$.membership.registrationFeeWaived").value(true))
			.andExpect(jsonPath("$.membership.annualFeeDue").value(false))
			.andExpect(jsonPath("$.membership.annualFeeNextDueAt").isString());
		perform(get("/api/hospital/dashboard"), token).andExpect(status().isOk());
		checkout(token, "hospital", "registration").andExpect(jsonPath("$.code").value("already_paid"));

		// Raising the fee later doesn't lock an account that joined while it was free.
		setFee("hospital_registration_fee", new BigDecimal("500.00"));
		perform(get("/api/hospital/dashboard"), token).andExpect(status().isOk());
		assertThat(hospitals.findById(hospitalId).orElseThrow().isRegistrationFeeWaived()).isTrue();
	}

	@Test
	void hospitalPaysRegistrationThenAnnualFee() throws Exception {
		setFee("hospital_registration_fee", new BigDecimal("500.00"));
		setFee("hospital_annual_fee", new BigDecimal("300.00"));
		String email = "hosp-paid-" + UUID.randomUUID() + "@example.com";
		UUID hospitalId = approvedHospital(email);
		String token = login(email);
		String admin = adminToken();

		// Approved but unpaid: the portal is locked, billing is open.
		perform(get("/api/notifications"), token).andExpect(
				jsonPath("$[0].message").value(org.hamcrest.Matchers.containsString("Pay the registration fee")));
		perform(get("/api/hospital/account"), token)
			.andExpect(jsonPath("$.membership.registrationFeeDue").value(true))
			.andExpect(jsonPath("$.membership.registrationFeeAud").value(500.0));
		perform(get("/api/hospital/dashboard"), token).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("registration_fee_unpaid"));
		perform(get("/api/hospital/cases"), token).andExpect(jsonPath("$.code").value("registration_fee_unpaid"));
		perform(get("/api/hospital/billing"), token).andExpect(jsonPath("$.payments.length()").value(0));
		checkout(token, "hospital", "annual").andExpect(jsonPath("$.code").value("registration_fee_not_paid"));
		checkout(token, "hospital", "bogus").andExpect(jsonPath("$.code").value("invalid_fee_type"));

		// Pay the registration fee (simulated provider).
		String intent = JsonPath.read(checkout(token, "hospital", "registration").andExpect(status().isOk())
			.andExpect(jsonPath("$.amountAud").value(500.0))
			.andReturn().getResponse().getContentAsString(), "$.intentId");
		// Another checkout reuses the same pending payment.
		checkout(token, "hospital", "registration").andExpect(jsonPath("$.intentId").value(intent));
		perform(post("/api/hospital/billing/simulate/" + intent), token).andExpect(status().isNoContent());

		perform(get("/api/hospital/dashboard"), token).andExpect(status().isOk());
		String billing = perform(get("/api/hospital/billing"), token)
			.andExpect(jsonPath("$.membership.registrationFeeDue").value(false))
			.andExpect(jsonPath("$.membership.registrationFeeWaived").value(false))
			.andExpect(jsonPath("$.membership.annualFeeDue").value(false))
			.andExpect(jsonPath("$.payments[0].status").value("completed"))
			.andReturn().getResponse().getContentAsString();
		String paymentId = JsonPath.read(billing, "$.payments[0].id");
		perform(get("/api/hospital/billing/payments/" + paymentId + "/invoice"), token).andExpect(status().isOk())
			.andExpect(content().contentType(MediaType.APPLICATION_PDF));
		checkout(token, "hospital", "annual").andExpect(jsonPath("$.code").value("not_due_yet"));
		perform(get("/api/notifications"), token).andExpect(jsonPath("$[0].title").value("Registration fee paid"));

		// The renewal falls due: a reminder only, the portal stays open.
		Instant due = Instant.now().minus(1, ChronoUnit.DAYS);
		jdbc.update("update hospitals set annual_fee_next_due_at = ? where id = ?", java.sql.Timestamp.from(due),
				hospitalId);
		perform(get("/api/hospital/account"), token).andExpect(jsonPath("$.membership.annualFeeDue").value(true));
		perform(get("/api/hospital/dashboard"), token).andExpect(status().isOk());
		String annual = JsonPath.read(checkout(token, "hospital", "annual").andExpect(jsonPath("$.amountAud").value(300.0))
			.andReturn().getResponse().getContentAsString(), "$.intentId");
		perform(post("/api/hospital/billing/simulate/" + annual), token).andExpect(status().isNoContent());
		Instant next = hospitals.findById(hospitalId).orElseThrow().getAnnualFeeNextDueAt();
		assertThat(next).isAfter(due.plus(360, ChronoUnit.DAYS)).isBefore(due.plus(370, ChronoUnit.DAYS));
		perform(get("/api/hospital/billing"), token).andExpect(jsonPath("$.payments.length()").value(2))
			.andExpect(jsonPath("$.membership.annualFeeDue").value(false));

		// MTA sees both payments, with the hospital's name, and refunds one.
		perform(get("/api/admin/payments"), admin)
			.andExpect(jsonPath("$[?(@.id == '%s')].kind".formatted(paymentId)).value("hospital"))
			.andExpect(jsonPath("$[?(@.id == '%s')].payerName".formatted(paymentId)).value("Fee Test Hospital"));
		perform(get("/api/admin/hospitals/" + hospitalId), admin)
			.andExpect(jsonPath("$.membership.registrationFeeDue").value(false));
		perform(get("/api/admin/payments/doctor/" + paymentId), admin).andExpect(status().isNotFound());
		perform(post("/api/admin/payments/hospital/" + paymentId + "/refunds").contentType(MediaType.APPLICATION_JSON)
			.content("{\"amountAud\":500,\"reason\":\"duplicate\"}"), admin)
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.payment.status").value("refunded"))
			.andExpect(jsonPath("$.payment.refundedToCardAud").value(500.0));
		perform(get("/api/notifications"), token).andExpect(jsonPath("$[0].title").value("Refund of A$500.00 issued"));
		perform(get("/api/hospital/billing"), token)
			.andExpect(jsonPath("$.payments[?(@.id == '%s')].status".formatted(paymentId)).value("refunded"));
	}

	@Test
	void lawyerIsLockedUntilPaidAndCantBeAssignedMeanwhile() throws Exception {
		setFee("lawyer_registration_fee", new BigDecimal("250.00"));
		String email = "lawyer-paid-" + UUID.randomUUID() + "@example.com";
		approvedLawyer(email);
		String token = login(email);
		String other = login(approvedLawyerEmail());

		perform(get("/api/lawyer/account"), token).andExpect(jsonPath("$.membership.registrationFeeDue").value(true));
		perform(get("/api/lawyer/cases"), token).andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("registration_fee_unpaid"));

		String intent = JsonPath.read(checkout(token, "lawyer", "registration").andExpect(jsonPath("$.amountAud").value(250.0))
			.andReturn().getResponse().getContentAsString(), "$.intentId");
		// Someone else can't complete this lawyer's payment.
		perform(post("/api/lawyer/billing/simulate/" + intent), other).andExpect(status().isNotFound());
		perform(post("/api/lawyer/billing/simulate/" + intent), token).andExpect(status().isNoContent());
		perform(get("/api/lawyer/cases"), token).andExpect(status().isOk());
		perform(get("/api/lawyer/billing"), token).andExpect(jsonPath("$.payments[0].feeType").value("registration"));
	}

	// ── Helpers ─────────────────────────────────────────────────────────────

	private void setFee(String key, BigDecimal amount) {
		jdbc.update("update platform_fee_settings set amount_aud = ? where fee_key = ?", amount, key);
	}

	private UUID approvedHospital(String email) {
		AppUser user = user(email, Role.HOSPITAL);
		Hospital hospital = hospitals.save(Hospital.registered(user.getId(), "Fee Test Hospital", "Brisbane", "Australia"));
		verification.recordDemoChecks(ProviderVerification.HOSPITAL, hospital.getId());
		hospitalAdmin.review(null, hospital.getId(), Hospital.APPROVED, null);
		return hospital.getId();
	}

	private UUID approvedLawyer(String email) {
		AppUser user = user(email, Role.LAWYER);
		Lawyer lawyer = lawyers.save(Lawyer.registered(user.getId(), "Fee Test Lawyer"));
		verification.recordDemoChecks(ProviderVerification.LAWYER, lawyer.getId());
		lawyerAdmin.review(null, lawyer.getId(), Lawyer.APPROVED, null);
		return lawyer.getId();
	}

	/** A second lawyer, approved while the fee is 0 so their portal is open. */
	private String approvedLawyerEmail() {
		BigDecimal fee = jdbc.queryForObject(
				"select amount_aud from platform_fee_settings where fee_key = 'lawyer_registration_fee'", BigDecimal.class);
		setFee("lawyer_registration_fee", BigDecimal.ZERO);
		String email = "lawyer-other-" + UUID.randomUUID() + "@example.com";
		approvedLawyer(email);
		setFee("lawyer_registration_fee", fee);
		return email;
	}

	private AppUser user(String email, Role role) {
		AppUser user = new AppUser(email, passwordEncoder.encode(PASSWORD), role);
		user.markEmailVerified();
		return users.save(user);
	}

	private ResultActions checkout(String token, String portal, String feeType) throws Exception {
		return perform(post("/api/" + portal + "/billing/checkout").contentType(MediaType.APPLICATION_JSON)
			.content("{\"feeType\":\"%s\"}".formatted(feeType)), token);
	}

	private String adminToken() throws Exception {
		String email = "admin-" + UUID.randomUUID() + "@example.com";
		user(email, Role.ADMIN);
		return login(email);
	}

	private String login(String email) throws Exception {
		return JsonPath.read(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, PASSWORD)))
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString(), "$.accessToken");
	}

	private ResultActions perform(AbstractMockHttpServletRequestBuilder<?> request, String token) throws Exception {
		return mvc.perform(request.header("Authorization", "Bearer " + token));
	}

}
