package com.iha.messaging;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class MessagingTests {

	private static final MessagingProperties.Resend RESEND = new MessagingProperties.Resend("re_test", "MTA <a@b.test>", "https://api.resend.com");
	private static final MessagingProperties.Twilio TWILIO = new MessagingProperties.Twilio("AC1", "token", "+61400000000", "https://api.twilio.com");
	private static final EmailBody BODY = EmailBody.of("Heading", "Message", null, null, null);

	private static MessagingProperties properties(MessagingProperties.Resend resend, MessagingProperties.Twilio twilio) {
		return new MessagingProperties("https://portal.test", false, resend, twilio);
	}

	@Test
	void emailGoesToResendWithTheKeyAndBothBodies() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo("https://api.resend.com/emails"))
			.andExpect(method(HttpMethod.POST))
			.andExpect(header("Authorization", "Bearer re_test"))
			.andExpect(jsonPath("$.from").value("MTA <a@b.test>"))
			.andExpect(jsonPath("$.to[0]").value("wei@example.com"))
			.andExpect(jsonPath("$.subject").value("Subject"))
			.andExpect(jsonPath("$.html").isNotEmpty())
			.andExpect(jsonPath("$.text").isNotEmpty())
			.andRespond(withSuccess("{\"id\":\"1\"}", MediaType.APPLICATION_JSON));

		new EmailSender(properties(RESEND, TWILIO), builder).send("wei@example.com", "Subject", BODY);

		server.verify();
	}

	@Test
	void aProviderFailureIsNotThrown() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo("https://api.resend.com/emails")).andRespond(withServerError());

		new EmailSender(properties(RESEND, TWILIO), builder).send("wei@example.com", "Subject", BODY);

		server.verify();
	}

	@Test
	void nothingIsSentWithoutCredentials() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		MessagingProperties blank = properties(new MessagingProperties.Resend("", "MTA <a@b.test>", "https://api.resend.com"),
				new MessagingProperties.Twilio("", "", "", "https://api.twilio.com"));

		new EmailSender(blank, builder).send("wei@example.com", "Subject", BODY);
		new SmsSender(blank, builder).send("+61412345678", "Message");

		server.verify();
	}

	@Test
	void smsGoesToTwilioInInternationalFormat() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo("https://api.twilio.com/2010-04-01/Accounts/AC1/Messages.json"))
			.andExpect(method(HttpMethod.POST))
			.andExpect(header("Authorization", "Basic QUMxOnRva2Vu"))
			.andExpect(content().formDataContains(java.util.Map.of("To", "+61412345678", "From", "+61400000000", "Body",
					"MTA: Hello")))
			.andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));

		new SmsSender(properties(RESEND, TWILIO), builder).send("0412 345 678", "MTA: Hello");

		server.verify();
	}

	@Test
	void anUndiallableNumberIsSkipped() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();

		new SmsSender(properties(RESEND, TWILIO), builder).send("not a number", "MTA: Hello");

		server.verify();
		assertThat(SmsSender.e164("+86 138 0013 8000")).isEqualTo("+8613800138000");
	}

	@Test
	void userTextCannotInjectHtml() {
		EmailBody body = EmailBody.of("Dr <b>Chen</b>", "<script>alert(1)</script>", "View", "https://p.test/a?x=1&y=2",
				"https://p.test/profile");

		assertThat(body.html()).doesNotContain("<script>", "<b>Chen").contains("&lt;script&gt;", "x=1&amp;y=2");
		assertThat(body.text()).contains("<script>alert(1)</script>", "View: https://p.test/a?x=1&y=2");
	}

}
