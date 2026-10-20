package com.iha.provider;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** An admin's invitation for a doctor to evaluate a case. */
@Entity
@Table(name = "doctor_case_assignments")
public class DoctorCaseAssignment {

	public static final String INVITED = "invited";
	public static final String ACCEPTED = "accepted";
	public static final String CANCELLED = "cancelled";

	@Id
	private UUID id;

	@Column(name = "case_id", nullable = false, updatable = false)
	private UUID caseId;

	@Column(name = "doctor_id", nullable = false, updatable = false)
	private UUID doctorId;

	@Column(nullable = false)
	private String status;

	@Column(name = "invited_at", nullable = false, updatable = false)
	private Instant invitedAt;

	protected DoctorCaseAssignment() {
	}

	public DoctorCaseAssignment(UUID caseId, UUID doctorId) {
		this.id = UUID.randomUUID();
		this.caseId = caseId;
		this.doctorId = doctorId;
		this.status = INVITED;
		this.invitedAt = Instant.now();
	}

	public UUID getId() {
		return id;
	}

	public UUID getCaseId() {
		return caseId;
	}

	public UUID getDoctorId() {
		return doctorId;
	}

	public String getStatus() {
		return status;
	}

	public void setStatus(String status) {
		this.status = status;
	}

}
