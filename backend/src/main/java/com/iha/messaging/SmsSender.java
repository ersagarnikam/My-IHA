package com.iha.messaging;

import com.google.i18n.phonenumbers.NumberParseException;
import com.google.i18n.phonenumbers.PhoneNumberUtil;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Async;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

/** Sends SMS through Twilio (old {@code @iha/notifications}). Failures are logged, never thrown. */
@Component
public class SmsSender {

	private static final Logger log = LoggerFactory.getLogger(SmsSender.class);

	private final MessagingProperties properties;
	private final RestClient http;

	@Autowired
	SmsSender(MessagingProperties properties) {
		this(properties, RestClient.builder().requestFactory(MessagingConfig.requestFactory()));
	}

	SmsSender(MessagingProperties properties, RestClient.Builder http) {
		this.properties = properties;
		this.http = http.build();
	}

	@Async(MessagingConfig.EXECUTOR)
	public void send(String phone, String message) {
		MessagingProperties.Twilio twilio = properties.twilio();
		if (!twilio.isConfigured()) {
			if (properties.logContent()) {
				log.info("[sms → {}] {}", phone, message);
			}
			else {
				log.warn("No SMS provider configured (TWILIO_*); an SMS was not delivered");
			}
			return;
		}
		String to = e164(phone);
		if (to == null) {
			log.warn("SMS skipped: the stored phone number can't be dialled");
			return;
		}
		MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
		form.add("To", to);
		form.add("From", twilio.phoneNumber());
		form.add("Body", message);
		try {
			http.post()
				.uri(twilio.baseUrl() + "/2010-04-01/Accounts/{sid}/Messages.json", twilio.accountSid())
				.headers(headers -> headers.setBasicAuth(twilio.accountSid(), twilio.authToken()))
				.contentType(MediaType.APPLICATION_FORM_URLENCODED)
				.body(form)
				.retrieve()
				.toBodilessEntity();
		}
		catch (RestClientException ex) {
			log.error("SMS failed: {}", ex.getClass().getSimpleName());
		}
	}

	/** Phone numbers are stored as typed; Twilio needs +61… Numbers without a country code are Australian. */
	static String e164(String phone) {
		PhoneNumberUtil util = PhoneNumberUtil.getInstance();
		try {
			var number = util.parse(phone, "AU");
			return util.isValidNumber(number) ? util.format(number, PhoneNumberUtil.PhoneNumberFormat.E164) : null;
		}
		catch (NumberParseException ex) {
			return null;
		}
	}

}
