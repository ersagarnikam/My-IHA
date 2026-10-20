package com.iha.provider;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A hospital account. Only the columns the patient portal reads are mapped so
 * far; the hospital portal port adds registration and profile fields.
 */
@Entity
@Table(name = "hospitals")
public class Hospital {

	@Id
	private UUID id;

	@Column(name = "user_id")
	private UUID userId;

	@Column(nullable = false)
	private String name;

	private String address;

	@Column(nullable = false)
	private String city;

	@Column(nullable = false)
	private String country;

	@Column(name = "zip_code")
	private String zipCode;

	@Column(name = "bed_count")
	private Integer bedCount;

	@Column(name = "room_types", nullable = false)
	private String[] roomTypes;

	private String[] specialties;

	@Column(nullable = false)
	private String status;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected Hospital() {
	}

	/** For tests and seed data until hospital registration is ported. */
	public Hospital(UUID userId, String name, String city, String country) {
		this.id = UUID.randomUUID();
		this.userId = userId;
		this.name = name;
		this.city = city;
		this.country = country;
		this.roomTypes = new String[0];
		this.status = "approved";
		this.createdAt = Instant.now();
	}

	public UUID getId() {
		return id;
	}

	public UUID getUserId() {
		return userId;
	}

	public String getName() {
		return name;
	}

	public String getAddress() {
		return address;
	}

	public String getCity() {
		return city;
	}

	public String getCountry() {
		return country;
	}

	public String getZipCode() {
		return zipCode;
	}

	public Integer getBedCount() {
		return bedCount;
	}

	public String[] getSpecialties() {
		return specialties;
	}

}
