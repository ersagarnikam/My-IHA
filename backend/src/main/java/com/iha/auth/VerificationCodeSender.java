package com.iha.auth;

import com.iha.messaging.EmailBody;
import com.iha.messaging.EmailSender;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * Delivers one-time codes (email verification, password reset) by email, and
 * also writes them to the log when {@code iha.verification.log-codes} is on.
 */
@Component
public class VerificationCodeSender {

	private static final Logger log = LoggerFactory.getLogger(VerificationCodeSender.class);

	private final VerificationProperties properties;
	private final EmailSender email;

	public VerificationCodeSender(VerificationProperties properties, EmailSender email) {
		this.properties = properties;
		this.email = email;
	}

	public void send(String address, String purpose, String code) {
		if (properties.logCodes()) {
			log.info("{} code for {}: {}", label(purpose), address, code);
		}
		boolean reset = EmailVerificationCode.RESET_PASSWORD.equals(purpose);
		String heading = reset ? "Reset your password" : "Verify your email";
		String message = "Your code is %s. It expires in %d minutes. If this wasn't you, you can ignore this email."
			.formatted(code, properties.codeTtl().toMinutes());
		email.send(address, heading + ": " + code, EmailBody.of(heading, message, null, null, null));
	}

	private static String label(String purpose) {
		return EmailVerificationCode.RESET_PASSWORD.equals(purpose) ? "Password reset" : "Verification";
	}

}
