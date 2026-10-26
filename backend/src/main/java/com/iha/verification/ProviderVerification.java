package com.iha.verification;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One check MTA made on a doctor or hospital (see {@link VerificationService}). */
@Entity
@Table(name = "provider_verifications")
public class ProviderVerification {

	public static final String DOCTOR = "doctor";
	public static final String HOSPITAL = "hospital";

	public static final String AHPRA = "ahpra";
	public static final String ACCREDITATION = "accreditation";
	public static final String LICENCE = "licence";

	public static final String VERIFIED = "verified";
	public static final String VERIFIED_WITH_CONDITIONS = "verified_with_conditions";
	public static final String FAILED = "failed";

	@Id
	private UUID id;

	@Column(name = "provider_type", nullable = false, updatable = false)
	private String providerType;

	@Column(name = "provider_id", nullable = false, updatable = false)
	private UUID providerId;

	@Column(name = "check_type", nullable = false, updatable = false)
	private String checkType;

	@Column(nullable = false, updatable = false)
	private String outcome;

	@Column(name = "valid_until", updatable = false)
	private LocalDate validUntil;

	@Column(updatable = false)
	private String details;

	@Column(name = "checked_by", updatable = false)
	private String checkedBy;

	@Column(name = "checked_at", nullable = false, updatable = false)
	private Instant checkedAt;

	protected ProviderVerification() {
	}

	ProviderVerification(String providerType, UUID providerId, String checkType, String outcome, LocalDate validUntil,
			String details, String checkedBy) {
		this.id = UUID.randomUUID();
		this.providerType = providerType;
		this.providerId = providerId;
		this.checkType = checkType;
		this.outcome = outcome;
		this.validUntil = validUntil;
		this.details = details;
		this.checkedBy = checkedBy;
		this.checkedAt = Instant.now();
	}

	/** Verified (with or without conditions) and not past its expiry. */
	public boolean passes(LocalDate today) {
		return !FAILED.equals(outcome) && (validUntil == null || !validUntil.isBefore(today));
	}

	public UUID getId() {
		return id;
	}

	public String getProviderType() {
		return providerType;
	}

	public UUID getProviderId() {
		return providerId;
	}

	public String getCheckType() {
		return checkType;
	}

	public String getOutcome() {
		return outcome;
	}

	public LocalDate getValidUntil() {
		return validUntil;
	}

	public String getDetails() {
		return details;
	}

	public String getCheckedBy() {
		return checkedBy;
	}

	public Instant getCheckedAt() {
		return checkedAt;
	}

}
