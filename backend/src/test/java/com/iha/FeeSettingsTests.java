package com.iha;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.iha.auth.AppUser;
import com.iha.auth.AppUserRepository;
import com.iha.auth.Role;
import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.test.web.servlet.request.AbstractMockHttpServletRequestBuilder;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Admin fee settings: listing, validation, history, and that each fee reaches
 * the place it is charged (doctor billing, consultations, plan publishing).
 * Restores every fee afterwards because the demo data and other tests rely on the defaults.
 */
@SpringBootTest
@AutoConfigureMockMvc
class FeeSettingsTests {

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

	@Test
	void adminConfiguresFeesAndTheyApplyToNewCharges() throws Exception {
		Map<String, BigDecimal> original = Map.copyOf(jdbc.query("select fee_key, amount_aud from platform_fee_settings",
				rs -> {
					Map<String, BigDecimal> m = new java.util.HashMap<>();
					while (rs.next()) {
						m.put(rs.getString(1), rs.getBigDecimal(2));
					}
					return m;
				}));
		String admin = token(Role.ADMIN);
		try {
			// ── Access and listing ──────────────────────────────────────────
			String doctor = login("doctor@demo.local", "Demo1234");
			perform(get("/api/admin/settings/fees"), doctor).andExpect(status().isForbidden());
			perform(put("/api/admin/settings/fees/doctor_annual_fee").contentType(MediaType.APPLICATION_JSON)
				.content("{\"amount\":1}"), doctor).andExpect(status().isForbidden());
			perform(get("/api/admin/settings/fees"), admin)
				.andExpect(jsonPath("$.fees.length()").value(8))
				.andExpect(jsonPath("$.fees[0].key").value("doctor_registration_fee"))
				.andExpect(jsonPath("$.fees[0].amount").value(5000.0))
				.andExpect(jsonPath("$.fees[0].charged").value(true))
				.andExpect(jsonPath("$.fees[?(@.key == 'lawyer_registration_fee')].charged").value(false))
				.andExpect(jsonPath("$.fees[?(@.key == 'consultation_fee')].amount").value(200.0))
				.andExpect(jsonPath("$.fees[?(@.key == 'mta_service_fee_pct')].unit").value("percent"));

			// ── Validation ──────────────────────────────────────────────────
			update(admin, "doctor_annual_fee", "-5", null).andExpect(jsonPath("$.code").value("invalid_amount"));
			update(admin, "doctor_annual_fee", "0", null).andExpect(jsonPath("$.code").value("invalid_amount"));
			update(admin, "doctor_annual_fee", "10.555", null).andExpect(jsonPath("$.code").value("invalid_amount"));
			update(admin, "doctor_annual_fee", "2000000", null).andExpect(jsonPath("$.code").value("invalid_amount"));
			update(admin, "mta_service_fee_pct", "101", null).andExpect(jsonPath("$.code").value("invalid_amount"));
			update(admin, "no_such_fee", "10", null).andExpect(status().isNotFound());
			perform(put("/api/admin/settings/fees/doctor_annual_fee").contentType(MediaType.APPLICATION_JSON)
				.content("{}"), admin).andExpect(status().isBadRequest());

			// ── Doctor fees reach doctor billing and the public schedule ────
			update(admin, "doctor_annual_fee", "2400", "2027 price review").andExpect(status().isOk())
				.andExpect(jsonPath("$.amount").value(2400.0))
				.andExpect(jsonPath("$.updatedBy").value(org.hamcrest.Matchers.startsWith("admin-")));
			perform(get("/api/doctor/billing"), doctor).andExpect(jsonPath("$.annualFeeAud").value(2400.0));
			perform(get("/api/fees"), doctor).andExpect(jsonPath("$.doctorAnnualFeeAud").value(2400.0));
			update(admin, "lawyer_registration_fee", "0", null).andExpect(status().isOk());
			update(admin, "lawyer_registration_fee", "1500", null).andExpect(jsonPath("$.amount").value(1500.0));

			// ── Consultation fee: new requests show it; paid ones keep what was charged ──
			String patient = login("patient@demo.local", "Demo1234");
			update(admin, "consultation_fee", "250", null).andExpect(status().isOk());
			perform(get("/api/fees"), patient).andExpect(jsonPath("$.consultationFeeAud").value(250.0));
			String consultations = perform(get("/api/patient/consultations"), patient).andReturn().getResponse()
				.getContentAsString();
			List<Double> fees = JsonPath.read(consultations, "$[?(@.status == 'scheduled')].feeAud");
			assertThat(fees).isNotEmpty().allMatch(f -> f == 200.0);

			// ── Suggested MTA service fee follows the percentage ────────────
			update(admin, "mta_service_fee_pct", "12.5", null).andExpect(status().isOk());
			String plans = perform(get("/api/admin/plans?status=submitted_to_iha"), admin).andReturn().getResponse()
				.getContentAsString();
			String planId = JsonPath.<List<String>>read(plans, "$[*].id").get(0);
			String plan = perform(get("/api/admin/plans/" + planId), admin).andReturn().getResponse().getContentAsString();
			BigDecimal total = new BigDecimal(JsonPath.read(plan, "$.totalAud").toString());
			assertThat(new BigDecimal(JsonPath.read(plan, "$.suggestedCommissionAud").toString()))
				.isEqualByComparingTo(total.multiply(new BigDecimal("0.125")).setScale(0, RoundingMode.HALF_UP));

			// ── History and audit ───────────────────────────────────────────
			perform(get("/api/admin/settings/fees"), admin)
				.andExpect(jsonPath("$.history[0].key").value("mta_service_fee_pct"))
				.andExpect(jsonPath("$.history[?(@.key == 'doctor_annual_fee')].reason").value("2027 price review"))
				.andExpect(jsonPath("$.history[?(@.key == 'doctor_annual_fee')].oldAmount").value(2000.0))
				.andExpect(jsonPath("$.history[?(@.key == 'doctor_annual_fee')].newAmount").value(2400.0));
			assertThat(jdbc.queryForObject("select count(*) from audit_logs where action = 'fee.changed'", Long.class))
				.isGreaterThanOrEqualTo(4);
			// Saving the same value again records nothing.
			long before = jdbc.queryForObject("select count(*) from platform_fee_changes", Long.class);
			update(admin, "doctor_annual_fee", "2400.00", null).andExpect(status().isOk());
			assertThat(jdbc.queryForObject("select count(*) from platform_fee_changes", Long.class)).isEqualTo(before);
		}
		finally {
			original.forEach((key, amount) -> jdbc.update(
					"update platform_fee_settings set amount_aud = ? where fee_key = ?", amount, key));
		}
	}

	private ResultActions update(String token, String key, String amount, String reason) throws Exception {
		String body = reason == null ? "{\"amount\":%s}".formatted(amount)
				: "{\"amount\":%s,\"reason\":\"%s\"}".formatted(amount, reason);
		return perform(put("/api/admin/settings/fees/" + key).contentType(MediaType.APPLICATION_JSON).content(body), token);
	}

	private String token(Role role) throws Exception {
		String email = role.name().toLowerCase() + "-" + UUID.randomUUID() + "@example.com";
		AppUser user = new AppUser(email, passwordEncoder.encode(PASSWORD), role);
		user.markEmailVerified();
		users.save(user);
		return login(email, PASSWORD);
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
