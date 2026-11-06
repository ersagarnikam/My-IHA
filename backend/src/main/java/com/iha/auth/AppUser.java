package com.iha.auth;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.EnumType;
import jakarta.persistence.Enumerated;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "app_users")
public class AppUser {

	@Id
	private UUID id;

	@Column(nullable = false)
	private String email;

	@Column(name = "password_hash", nullable = false)
	private String passwordHash;

	@Enumerated(EnumType.STRING)
	@Column(nullable = false)
	private Role role;

	@Column(name = "email_verified_at")
	private Instant emailVerifiedAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "suspended_at")
	private Instant suspendedAt;

	@Column(name = "suspended_reason")
	private String suspendedReason;

	protected AppUser() {
	}

	public AppUser(String email, String passwordHash, Role role) {
		this.id = UUID.randomUUID();
		this.email = email;
		this.passwordHash = passwordHash;
		this.role = role;
		this.createdAt = Instant.now();
	}

	public UUID getId() {
		return id;
	}

	public String getEmail() {
		return email;
	}

	public String getPasswordHash() {
		return passwordHash;
	}

	public Role getRole() {
		return role;
	}

	public boolean isEmailVerified() {
		return emailVerifiedAt != null;
	}

	public void changePassword(String newPasswordHash) {
		this.passwordHash = newPasswordHash;
	}

	/** Account closed: the email is replaced so it can't sign in or be found, and the address is free again. */
	public void close(String placeholderEmail, String unusableHash) {
		this.email = placeholderEmail;
		this.passwordHash = unusableHash;
	}

	public void suspend(String reason) {
		suspendedAt = Instant.now();
		suspendedReason = reason;
	}

	public void reactivate() {
		suspendedAt = null;
		suspendedReason = null;
	}

	public boolean isSuspended() {
		return suspendedAt != null;
	}

	public String getSuspendedReason() {
		return suspendedReason;
	}

	public boolean isClosed() {
		return email.endsWith("@deleted.invalid");
	}

	public void markEmailVerified() {
		if (emailVerifiedAt == null) {
			emailVerifiedAt = Instant.now();
		}
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

}
