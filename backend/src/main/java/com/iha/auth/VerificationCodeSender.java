package com.iha.auth;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Delivers one-time codes (email verification, password reset). Until an email
 * provider (Resend in the old stack) is ported, codes are only written to the
 * log when {@code iha.verification.log-codes} is on.
 */
@Component
public class VerificationCodeSender {

	private static final Logger log = LoggerFactory.getLogger(VerificationCodeSender.class);

	private final VerificationProperties properties;

	public VerificationCodeSender(VerificationProperties properties) {
		this.properties = properties;
	}

	public void send(String email, String purpose, String code) {
		if (properties.logCodes()) {
			log.info("{} code for {}: {}", label(purpose), email, code);
		}
		else {
			log.warn("No email provider configured; {} code for {} was not delivered", label(purpose), email);
		}
	}

	private static String label(String purpose) {
		return EmailVerificationCode.RESET_PASSWORD.equals(purpose) ? "Password reset" : "Verification";
	}

}
