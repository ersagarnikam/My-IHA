package com.iha.messaging;

import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/**
 * Sends email through Resend (old {@code @iha/notifications}). Failures are
 * logged, never thrown: a lost message must not fail the action behind it, and
 * everything is also in the portal or can be sent again.
 */
@Component
public class EmailSender {

	private static final Logger log = LoggerFactory.getLogger(EmailSender.class);

	private final MessagingProperties properties;
	private final RestClient http;

	@Autowired
	EmailSender(MessagingProperties properties) {
		this(properties, RestClient.builder().requestFactory(MessagingConfig.requestFactory()));
	}

	EmailSender(MessagingProperties properties, RestClient.Builder http) {
		this.properties = properties;
		this.http = http.build();
	}

	@Async(MessagingConfig.EXECUTOR)
	public void send(String to, String subject, EmailBody body) {
		MessagingProperties.Resend resend = properties.resend();
		if (!resend.isConfigured()) {
			if (properties.logContent()) {
				log.info("[email → {}] {}: {}", to, subject, body.text());
			}
			else {
				log.warn("No email provider configured (RESEND_API_KEY); email to {} was not delivered", to);
			}
			return;
		}
		try {
			http.post()
				.uri("https://api.resend.com/emails")
				.header("Authorization", "Bearer " + resend.apiKey())
				.contentType(MediaType.APPLICATION_JSON)
				.body(Map.of("from", resend.fromAddress(), "to", List.of(to), "subject", subject, "html", body.html(),
						"text", body.text()))
				.retrieve()
				.toBodilessEntity();
		}
		catch (RestClientException ex) {
			// Never log the body or the exception's response text: they can repeat the message.
			log.error("Email to {} failed: {}", to, ex.getClass().getSimpleName());
		}
	}

}
