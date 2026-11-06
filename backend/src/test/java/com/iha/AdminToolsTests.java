package com.iha;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.containsString;
import static org.hamcrest.Matchers.hasItem;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.util.UUID;

import com.iha.auth.AppUser;
import com.iha.auth.AppUserRepository;
import com.iha.cases.CaseRepository;
import com.iha.cases.CaseStatus;
import com.iha.cases.MedicalCase;
import com.iha.messaging.EmailBody;
import com.iha.messaging.EmailSender;
import com.iha.messaging.SmsSender;
import com.iha.patient.Patient;
import com.iha.patient.PatientRepository;
import com.jayway.jsonpath.JsonPath;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class AdminToolsTests {

	@Autowired
	MockMvc mvc;

	@Autowired
	AppUserRepository users;

	@Autowired
	PatientRepository patients;

	@Autowired
	CaseRepository cases;

	@MockitoBean
	EmailSender email;

	@MockitoBean
	SmsSender sms;

	private String login(String address) throws Exception {
		String body = mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"Demo1234\"}".formatted(address)))
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
		return "Bearer " + JsonPath.read(body, "$.accessToken");
	}

	private UUID userId(String address) {
		return users.findByEmail(address).orElseThrow().getId();
	}

	@Test
	void suspensionBlocksSignInAndAnExistingToken() throws Exception {
		String admin = login("admin@demo.local");
		String peer = login("peer1@demo.local");
		UUID peerId = userId("peer1@demo.local");
		mvc.perform(get("/api/auth/me").header("Authorization", peer)).andExpect(status().isOk());

		mvc.perform(post("/api/admin/users/" + peerId + "/suspend").header("Authorization", admin)
			.contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"short\"}"))
			.andExpect(status().isBadRequest());
		mvc.perform(post("/api/admin/users/" + peerId + "/suspend").header("Authorization", admin)
			.contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Registration under investigation\"}"))
			.andExpect(status().isNoContent());

		mvc.perform(get("/api/auth/me").header("Authorization", peer))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.code").value("account_suspended"));
		mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"peer1@demo.local\",\"password\":\"Demo1234\"}"))
			.andExpect(status().isForbidden())
			.andExpect(jsonPath("$.code").value("account_suspended"));
		mvc.perform(get("/api/admin/users/" + peerId).header("Authorization", admin))
			.andExpect(jsonPath("$.user.status").value("suspended"))
			.andExpect(jsonPath("$.suspendedReason").value("Registration under investigation"));

		mvc.perform(post("/api/admin/users/" + peerId + "/reactivate").header("Authorization", admin))
			.andExpect(status().isNoContent());
		mvc.perform(get("/api/auth/me").header("Authorization", peer)).andExpect(status().isOk());
	}

	@Test
	void adminsCannotSuspendThemselves() throws Exception {
		String admin = login("admin@demo.local");
		mvc.perform(post("/api/admin/users/" + userId("admin@demo.local") + "/suspend").header("Authorization", admin)
			.contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Locking myself out\"}"))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("cannot_suspend_self"));
	}

	@Test
	void usersAreListedWithTheirNamesAndAreAdminOnly() throws Exception {
		mvc.perform(get("/api/admin/users").header("Authorization", login("admin@demo.local")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[?(@.email == 'doctor@demo.local')].name", hasItem(containsString("Chen"))));
		mvc.perform(get("/api/admin/users").header("Authorization", login("doctor@demo.local")))
			.andExpect(status().isForbidden());
		mvc.perform(get("/api/admin/audit").header("Authorization", login("doctor@demo.local")))
			.andExpect(status().isForbidden());
	}

	@Test
	void aNewAdminSetsTheirOwnPasswordFromTheEmailedLink() throws Exception {
		String admin = login("admin@demo.local");
		String address = "staff-" + UUID.randomUUID() + "@example.com";

		mvc.perform(post("/api/admin/users/admins").header("Authorization", admin)
			.contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"%s\"}".formatted(address)))
			.andExpect(status().isCreated());

		AppUser created = users.findByEmail(address).orElseThrow();
		assertThat(created.isEmailVerified()).isTrue();
		ArgumentCaptor<EmailBody> body = ArgumentCaptor.forClass(EmailBody.class);
		verify(email).send(eq(address), anyString(), body.capture());
		assertThat(body.getValue().text()).contains("/reset-password?email=");
		mvc.perform(post("/api/admin/users/admins").header("Authorization", admin)
			.contentType(MediaType.APPLICATION_JSON).content("{\"email\":\"%s\"}".formatted(address)))
			.andExpect(status().isConflict());
	}

	@Test
	void auditLogIsSearchable() throws Exception {
		String admin = login("admin@demo.local");
		mvc.perform(get("/api/admin/audit").param("q", "AUTH.LOGIN").header("Authorization", admin))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.rows[0].action").value("auth.login"))
			.andExpect(jsonPath("$.total").isNumber());
	}

	private MedicalCase newCase() {
		Patient patient = patients.findByUserId(userId("patient@demo.local")).orElseThrow();
		return cases.findByPatientIdOrderByCreatedAtDesc(patient.getId()).stream()
			.filter(c -> c.getStatus() == CaseStatus.CASE_SUBMITTED || c.getStatus() == CaseStatus.UNDER_REVIEW
					|| c.getStatus() == CaseStatus.EVALUATION)
			.findFirst()
			.orElseThrow();
	}

	@Test
	void aCaseCanBeClosedOnceWithAReason() throws Exception {
		String admin = login("admin@demo.local");
		MedicalCase medicalCase = newCase();

		mvc.perform(post("/api/admin/cases/" + medicalCase.getId() + "/close").header("Authorization", admin)
			.contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Patient withdrew by phone\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.status").value("closed"))
			.andExpect(jsonPath("$.closedReason").value("Patient withdrew by phone"));

		mvc.perform(post("/api/admin/cases/" + medicalCase.getId() + "/close").header("Authorization", admin)
			.contentType(MediaType.APPLICATION_JSON).content("{\"reason\":\"Patient withdrew by phone\"}"))
			.andExpect(status().isConflict());
		mvc.perform(post("/api/admin/cases/" + medicalCase.getId() + "/complete").header("Authorization", admin))
			.andExpect(status().isConflict());
	}

	@Test
	void paymentsExportAsASafeSpreadsheet() throws Exception {
		mvc.perform(get("/api/admin/payments/export").header("Authorization", login("admin@demo.local")))
			.andExpect(status().isOk())
			.andExpect(header().string("Content-Disposition", containsString("mta-payments.csv")))
			.andExpect(content().string(containsString("Amount AUD")));
	}

}
