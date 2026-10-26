package com.iha.patient;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.UUID;

import com.iha.auth.AppUser;
import com.iha.auth.AppUserRepository;
import com.iha.auth.Role;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.test.web.servlet.MockMvc;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

/**
 * Consent at sign-up (recorded with the current version) and record retention:
 * a deleted account is closed after the grace period (login and contact
 * details erased, records kept for the configured years), then purged.
 */
@SpringBootTest
@AutoConfigureMockMvc
class PrivacyTests {

	private static final String PASSWORD = "Secret123";

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	PatientRepository patients;

	@Autowired
	AppUserRepository users;

	@Autowired
	PatientRetentionJob retention;

	@Autowired
	PasswordEncoder passwordEncoder;

	@Test
	void consentIsRequiredAndRecorded() throws Exception {
		mvc.perform(get("/api/auth/privacy"))
			.andExpect(jsonPath("$.privacyPolicyUrl").value("https://medicaltourismaustralia.com/privacy-policy/"))
			.andExpect(jsonPath("$.consentVersion").value("2026-10"));

		String email = "consent-" + UUID.randomUUID() + "@example.com";
		mvc.perform(post("/api/auth/register/patient").contentType(MediaType.APPLICATION_JSON)
			.content("{\"fullName\":\"Mei Lin\",\"email\":\"%s\",\"password\":\"%s\",\"acceptTerms\":true}".formatted(email,
					PASSWORD)))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("consent_required"));
		assertThat(users.findByEmail(email)).isEmpty();
		mvc.perform(post("/api/auth/register/doctor").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted("x" + email, PASSWORD)))
			.andExpect(jsonPath("$.code").value("consent_required"));

		mvc.perform(post("/api/auth/register/patient").contentType(MediaType.APPLICATION_JSON)
			.content("{\"fullName\":\"Mei Lin\",\"email\":\"%s\",\"password\":\"%s\",\"acceptTerms\":true,\"consentHealthInfo\":true}"
				.formatted(email, PASSWORD)))
			.andExpect(status().isAccepted());
		UUID userId = users.findByEmail(email).orElseThrow().getId();
		assertThat(jdbc.queryForList("select kind from consents where user_id = ? and version = '2026-10' order by kind",
				String.class, userId))
			.containsExactly("health_information", "terms_and_privacy");
	}

	@Test
	void adminPrivacySettings() throws Exception {
		String admin = adminToken();
		mvc.perform(put("/api/admin/settings/privacy").header("Authorization", "Bearer " + admin)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"privacyPolicyUrl\":\"http://x\",\"termsUrl\":\"https://x\",\"consentVersion\":\"v2\",\"retentionYears\":7}"))
			.andExpect(jsonPath("$.code").value("invalid_url"));
		mvc.perform(put("/api/admin/settings/privacy").header("Authorization", "Bearer " + admin)
			.contentType(MediaType.APPLICATION_JSON)
			.content("{\"privacyPolicyUrl\":\"https://medicaltourismaustralia.com/privacy-policy/\",\"termsUrl\":\"https://medicaltourismaustralia.com/terms-and-conditions/\",\"consentVersion\":\"2026-10\",\"retentionYears\":0}"))
			.andExpect(jsonPath("$.code").value("invalid_retention_years"));
		mvc.perform(get("/api/admin/settings/privacy").header("Authorization", "Bearer " + admin))
			.andExpect(jsonPath("$.retentionYears").value(7));
	}

	@Test
	void deletedAccountIsClosedThenPurged() {
		AppUser user = new AppUser("retain-" + UUID.randomUUID() + "@example.com", passwordEncoder.encode(PASSWORD),
				Role.PATIENT);
		user.markEmailVerified();
		users.save(user);
		Patient patient = new Patient(user.getId(), "Retained Patient");
		patient.setAvatarPath(null);
		patients.save(patient);
		jdbc.update("update patients set phone_enc = null, is_deleted = true, deleted_at = ?, scheduled_delete_at = ? where id = ?",
				Timestamp.from(Instant.now().minus(31, ChronoUnit.DAYS)),
				Timestamp.from(Instant.now().minus(1, ChronoUnit.DAYS)), patient.getId());

		Instant now = Instant.now();
		retention.closeAccounts(now);
		Patient closed = patients.findById(patient.getId()).orElseThrow();
		assertThat(closed.getAccountClosedAt()).isNotNull();
		assertThat(closed.getFullName()).isEqualTo("Retained Patient");
		assertThat(closed.getRetainUntil()).isAfter(now.plus(6 * 365, ChronoUnit.DAYS))
			.isBefore(now.plus(8 * 365, ChronoUnit.DAYS));
		AppUser login = users.findById(user.getId()).orElseThrow();
		assertThat(login.getEmail()).endsWith("@deleted.invalid");
		assertThat(passwordEncoder.matches(PASSWORD, login.getPasswordHash())).isFalse();

		// Not yet: still within the retention period.
		retention.purgeExpired(now.plus(365, ChronoUnit.DAYS));
		assertThat(patients.findById(patient.getId())).isPresent();
		retention.purgeExpired(closed.getRetainUntil().plusSeconds(1));
		assertThat(patients.findById(patient.getId())).isEmpty();
		assertThat(users.findById(user.getId())).isEmpty();
	}

	private String adminToken() throws Exception {
		String email = "admin-" + UUID.randomUUID() + "@example.com";
		AppUser user = new AppUser(email, passwordEncoder.encode(PASSWORD), Role.ADMIN);
		user.markEmailVerified();
		users.save(user);
		String body = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"%s\"}".formatted(email, PASSWORD)))
			.andReturn().getResponse().getContentAsString();
		return com.jayway.jsonpath.JsonPath.read(body, "$.accessToken");
	}

}
