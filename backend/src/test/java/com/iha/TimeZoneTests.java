package com.iha;

import java.nio.file.Path;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.UUID;

import com.jayway.jsonpath.JsonPath;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
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
 * Doctors and hospitals work in their own Australian time zone: a Sydney
 * doctor's 10:00 is 23:00 UTC the day before in summer (daylight saving) and
 * 00:00 UTC in winter, and patients get the doctor's zone with the slots.
 */
@SpringBootTest
@AutoConfigureMockMvc
class TimeZoneTests {

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

	@Test
	void sydneyDoctorProposesTimesAcrossDaylightSaving() throws Exception {
		String doctor = login("doctor@demo.local");
		perform(get("/api/doctor/account"), doctor).andExpect(jsonPath("$.doctor.timeZone").value("Australia/Sydney"));

		// The demo doctor's case in evaluation without a consultation yet.
		UUID caseId = jdbc.queryForObject("""
				select a.case_id from doctor_case_assignments a
				join doctors d on d.id = a.doctor_id
				join app_users u on u.id = d.user_id
				join cases c on c.id = a.case_id
				where u.email = 'doctor@demo.local' and a.status = 'accepted' and c.status = 'evaluation'
				  and not exists (select 1 from consultation_requests r where r.case_id = a.case_id)
				fetch first 1 rows only""", UUID.class);

		int year = LocalDate.now(ZoneId.of("Australia/Sydney")).getYear() + 1;
		String summer = year + "-01-15";
		String winter = year + "-07-15";
		String body = perform(post("/api/doctor/cases/" + caseId + "/initial-consultation")
			.contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"slots":[{"date":"%s","startTime":"10:00","endTime":"10:30"},
					          {"date":"%s","startTime":"10:00","endTime":"10:30"}]}""".formatted(summer, winter)), doctor)
			.andExpect(status().isCreated())
			.andReturn().getResponse().getContentAsString();
		List<String> starts = JsonPath.read(body, "$.slots[*].slotTime");
		// 10:00 AEDT (UTC+11) and 10:00 AEST (UTC+10).
		assertThat(starts).containsExactlyInAnyOrder(year + "-01-14T23:00:00Z", winter + "T00:00:00Z");

		// The patient gets the doctor's zone with the times.
		String patient = login("patient@demo.local");
		perform(get("/api/patient/cases/" + caseId + "/consultations"), patient)
			.andExpect(jsonPath("$[?(@.kind == 'initial')].doctorTimeZone").value("Australia/Sydney"));

		// Only Australian zones; changing it applies to new times.
		perform(put("/api/doctor/profile/time-zone").contentType(MediaType.APPLICATION_JSON)
			.content("{\"timeZone\":\"Europe/London\"}"), doctor)
			.andExpect(jsonPath("$.code").value("invalid_time_zone"));
		perform(put("/api/doctor/profile/time-zone").contentType(MediaType.APPLICATION_JSON)
			.content("{\"timeZone\":\"Australia/Perth\"}"), doctor)
			.andExpect(jsonPath("$.timeZone").value("Australia/Perth"));
		perform(put("/api/doctor/profile/time-zone").contentType(MediaType.APPLICATION_JSON)
			.content("{\"timeZone\":\"Australia/Sydney\"}"), doctor)
			.andExpect(jsonPath("$.timeZone").value("Australia/Sydney"));
	}

	@Test
	void hospitalsHaveATimeZoneToo() throws Exception {
		String hospital = login("hospital@demo.local");
		String account = perform(get("/api/hospital/account"), hospital).andReturn().getResponse().getContentAsString();
		assertThat(JsonPath.<String>read(account, "$.hospital.timeZone")).isEqualTo("Australia/Sydney");
		String basic = """
				{"name":"St Vincent's Hospital Sydney","registrationNumber":"HOSP-NSW-0390","abnNumber":"51824753556",
				 "phone":"+61 2 8382 1111","country":"Australia","city":"Sydney","address":"390 Victoria Street",
				 "zipCode":"2010","timeZone":"%s"}""";
		perform(put("/api/hospital/profile/basic").contentType(MediaType.APPLICATION_JSON)
			.content(basic.formatted("Asia/Kolkata")), hospital)
			.andExpect(jsonPath("$.code").value("invalid_time_zone"));
		perform(put("/api/hospital/profile/basic").contentType(MediaType.APPLICATION_JSON)
			.content(basic.formatted("Australia/Sydney")), hospital)
			.andExpect(jsonPath("$.timeZone").value("Australia/Sydney"));
	}

	private String login(String email) throws Exception {
		return JsonPath.read(mvc.perform(post("/api/auth/login").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"Demo1234\"}".formatted(email)))
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString(), "$.accessToken");
	}

	private ResultActions perform(AbstractMockHttpServletRequestBuilder<?> request, String token) throws Exception {
		return mvc.perform(request.header("Authorization", "Bearer " + token));
	}

}
