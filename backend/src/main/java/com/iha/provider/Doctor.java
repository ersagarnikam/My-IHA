package com.iha.provider;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A doctor account. Only the columns the patient portal reads are mapped so
 * far; the doctor portal port adds registration, fees and availability.
 */
@Entity
@Table(name = "doctors")
public class Doctor {

	@Id
	private UUID id;

	@Column(name = "user_id")
	private UUID userId;

	@Column(name = "full_name", nullable = false)
	private String fullName;

	private String[] specialties;

	private String qualifications;

	@Column(name = "years_experience")
	private Integer yearsExperience;

	@Column(name = "photo_url")
	private String photoUrl;

	@Column(name = "working_days", nullable = false)
	private String[] workingDays;

	@Column(nullable = false)
	private String status;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected Doctor() {
	}

	/** For tests and seed data until doctor registration is ported. */
	public Doctor(UUID userId, String fullName) {
		this.id = UUID.randomUUID();
		this.userId = userId;
		this.fullName = fullName;
		this.workingDays = new String[0];
		this.status = "approved";
		this.createdAt = Instant.now();
	}

	public UUID getId() {
		return id;
	}

	public UUID getUserId() {
		return userId;
	}

	public String getFullName() {
		return fullName;
	}

	public String[] getSpecialties() {
		return specialties;
	}

	public String getQualifications() {
		return qualifications;
	}

	public Integer getYearsExperience() {
		return yearsExperience;
	}

	public String getPhotoUrl() {
		return photoUrl;
	}

}
