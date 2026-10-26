package com.iha;

import java.nio.file.Path;
import java.util.List;
import java.util.UUID;

import com.iha.auth.AppUser;
import com.iha.auth.AppUserRepository;
import com.iha.auth.Role;
import com.jayway.jsonpath.JsonPath;
import org.apache.pdfbox.Loader;
import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.text.PDFTextStripper;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
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
 * MTA's business details and GST: plain invoices until MTA is registered,
 * then tax invoices with the ABN, GST per line (the service fee and doctor
 * fees taxable, treatment costs and consultations GST-free) and the GST total.
 * Restores the defaults afterwards because other tests share the database.
 */
@SpringBootTest
@AutoConfigureMockMvc
class TaxInvoiceTests {

	private static final String DEFAULTS = """
			{"legalName":"Medical Tourism Australia","abn":"","address":"","email":"","gstRegistered":false,
			 "taxable":{"MTA_SERVICE_FEE":true,"DOCTOR_FEES":true,"CONSULTATION_FEE":false,"TREATMENT_COSTS":false}}""";

	@TempDir
	static Path storageRoot;

	@DynamicPropertySource
	static void storage(DynamicPropertyRegistry registry) {
		registry.add("iha.storage.root", () -> storageRoot.toString());
	}

	@Autowired
	MockMvc mvc;

	@Autowired
	AppUserRepository users;

	@Autowired
	PasswordEncoder passwordEncoder;

	@Test
	void invoicesFollowTheGstSettings() throws Exception {
		String admin = adminToken();
		String patient = login("patient@demo.local", "Demo1234");
		String doctor = login("doctor@demo.local", "Demo1234");
		perform(get("/api/admin/settings/business"), patient).andExpect(status().isForbidden());
		perform(get("/api/admin/settings/business"), admin)
			.andExpect(jsonPath("$.gstRegistered").value(false))
			.andExpect(jsonPath("$.taxInvoices").value(false))
			.andExpect(jsonPath("$.charges[?(@.charge == 'MTA_SERVICE_FEE')].taxable").value(true))
			.andExpect(jsonPath("$.charges[?(@.charge == 'TREATMENT_COSTS')].taxable").value(false));

		String payments = perform(get("/api/patient/payments"), patient).andReturn().getResponse().getContentAsString();
		String treatment = JsonPath.<List<String>>read(payments,
				"$[?(@.paymentType == 'full_payment' && @.status == 'completed')].id").get(0);
		String billing = perform(get("/api/doctor/billing"), doctor).andReturn().getResponse().getContentAsString();
		String registration = JsonPath.<List<String>>read(billing, "$.payments[?(@.feeType == 'registration')].id").get(0);

		// Not registered: a plain invoice saying no GST was charged.
		String plain = pdfText(perform(get("/api/patient/payments/" + treatment + "/invoice"), patient));
		assertThat(plain).contains("INVOICE").doesNotContain("TAX INVOICE").contains("No GST has been charged.");

		try {
			business(admin, DEFAULTS.replace("\"abn\":\"\"", "\"abn\":\"12 345 678 901\""))
				.andExpect(jsonPath("$.code").value("invalid_abn"));
			business(admin, DEFAULTS.replace("\"gstRegistered\":false", "\"gstRegistered\":true"))
				.andExpect(jsonPath("$.code").value("abn_required"));
			business(admin, DEFAULTS.replace("\"abn\":\"\"", "\"abn\":\"51 824 753 556\"")
				.replace("\"address\":\"\"", "\"address\":\"1 Eagle Street, Brisbane QLD 4000\"")
				.replace("\"gstRegistered\":false", "\"gstRegistered\":true"))
				.andExpect(status().isOk())
				.andExpect(jsonPath("$.abn").value("51824753556"))
				.andExpect(jsonPath("$.taxInvoices").value(true))
				.andExpect(jsonPath("$.updatedBy").value(org.hamcrest.Matchers.startsWith("admin-")));

			// Registered: a tax invoice with the ABN, GST on the service fee only.
			String tax = pdfText(perform(get("/api/patient/payments/" + treatment + "/invoice"), patient));
			assertThat(tax).contains("TAX INVOICE", "ABN 51 824 753 556", "1 Eagle Street", "GST-free",
					"Total includes GST of").doesNotContain("No GST has been charged.");
			// Doctor fees are taxable: A$5,000 includes A$454.55 GST.
			String fee = pdfText(perform(get("/api/doctor/billing/payments/" + registration + "/invoice"), doctor));
			assertThat(fee).contains("TAX INVOICE", "$454.55");
		}
		finally {
			business(admin, DEFAULTS).andExpect(status().isOk());
		}
	}

	private ResultActions business(String admin, String body) throws Exception {
		return perform(put("/api/admin/settings/business").contentType(MediaType.APPLICATION_JSON).content(body), admin);
	}

	private static String pdfText(ResultActions result) throws Exception {
		byte[] bytes = result.andExpect(status().isOk()).andReturn().getResponse().getContentAsByteArray();
		try (PDDocument doc = Loader.loadPDF(bytes)) {
			return new PDFTextStripper().getText(doc);
		}
	}

	private String adminToken() throws Exception {
		String email = "admin-" + UUID.randomUUID() + "@example.com";
		AppUser user = new AppUser(email, passwordEncoder.encode("Secret123"), Role.ADMIN);
		user.markEmailVerified();
		users.save(user);
		return login(email, "Secret123");
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
