package com.iha.privacy;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Something a person agreed to at sign-up, and which version (see {@link ConsentService}). */
@Entity
@Table(name = "consents")
public class Consent {

	/** MTA's terms of use and privacy policy (everyone). */
	public static final String TERMS_AND_PRIVACY = "terms_and_privacy";

	/** Collecting the patient's health information and sharing it with providers, including overseas. */
	public static final String HEALTH_INFORMATION = "health_information";

	@Id
	private UUID id;

	@Column(name = "user_id", nullable = false, updatable = false)
	private UUID userId;

	@Column(nullable = false, updatable = false)
	private String kind;

	@Column(nullable = false, updatable = false)
	private String version;

	@Column(name = "accepted_at", nullable = false, updatable = false)
	private Instant acceptedAt;

	protected Consent() {
	}

	Consent(UUID userId, String kind, String version) {
		this.id = UUID.randomUUID();
		this.userId = userId;
		this.kind = kind;
		this.version = version;
		this.acceptedAt = Instant.now();
	}

	public UUID getId() {
		return id;
	}

	public UUID getUserId() {
		return userId;
	}

	public String getKind() {
		return kind;
	}

	public String getVersion() {
		return version;
	}

	public Instant getAcceptedAt() {
		return acceptedAt;
	}

}
