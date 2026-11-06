package com.iha.messaging;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * Email (Resend) and SMS (Twilio) credentials. Leave either blank to skip that channel.
 *
 * @param portalUrl public address of the portal, for links in messages
 * @param logContent write undelivered messages to the log (development only: they hold personal details)
 */
@ConfigurationProperties("iha.messaging")
public record MessagingProperties(String portalUrl, boolean logContent, Resend resend, Twilio twilio) {

	public record Resend(String apiKey, String fromAddress) {

		public boolean isConfigured() {
			return notBlank(apiKey) && notBlank(fromAddress);
		}

	}

	public record Twilio(String accountSid, String authToken, String phoneNumber) {

		public boolean isConfigured() {
			return notBlank(accountSid) && notBlank(authToken) && notBlank(phoneNumber);
		}

	}

	private static boolean notBlank(String value) {
		return value != null && !value.isBlank();
	}

}
