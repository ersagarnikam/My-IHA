package com.iha.auth;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A one-time code emailed to the user (verification or password reset). Only its SHA-256 hash is stored. */
@Entity
@Table(name = "email_verification_codes")
public class EmailVerificationCode {

	public static final String VERIFY_EMAIL = "verify_email";
	public static final String RESET_PASSWORD = "reset_password";

	@Id
	private UUID id;

	@Column(name = "user_id", nullable = false)
	private UUID userId;

	@Column(nullable = false)
	private String purpose;

	@Column(name = "code_hash", nullable = false)
	private String codeHash;

	@Column(nullable = false)
	private int attempts;

	@Column(name = "expires_at", nullable = false)
	private Instant expiresAt;

	@Column(name = "consumed_at")
	private Instant consumedAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected EmailVerificationCode() {
	}

	public EmailVerificationCode(UUID userId, String purpose, String codeHash, Instant expiresAt) {
		this.id = UUID.randomUUID();
		this.userId = userId;
		this.purpose = purpose;
		this.codeHash = codeHash;
		this.expiresAt = expiresAt;
		this.createdAt = Instant.now();
	}

	public String getCodeHash() {
		return codeHash;
	}

	public int getAttempts() {
		return attempts;
	}

	public boolean isUsable(Instant now, int maxAttempts) {
		return consumedAt == null && now.isBefore(expiresAt) && attempts < maxAttempts;
	}

	public void recordFailedAttempt() {
		attempts++;
	}

	public void consume() {
		consumedAt = Instant.now();
	}

}
