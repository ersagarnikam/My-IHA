package com.iha.provider;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A hospital the doctor works with; the treatment plan's hospital is picked from these. */
@Entity
@Table(name = "doctor_hospital_affiliations")
public class DoctorHospitalAffiliation {

	@Id
	private UUID id;

	@Column(name = "doctor_id", nullable = false, updatable = false)
	private UUID doctorId;

	@Column(name = "hospital_id", nullable = false, updatable = false)
	private UUID hospitalId;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected DoctorHospitalAffiliation() {
	}

	public DoctorHospitalAffiliation(UUID doctorId, UUID hospitalId) {
		this.id = UUID.randomUUID();
		this.doctorId = doctorId;
		this.hospitalId = hospitalId;
		this.createdAt = Instant.now();
	}

	public UUID getDoctorId() {
		return doctorId;
	}

	public UUID getHospitalId() {
		return hospitalId;
	}

}
