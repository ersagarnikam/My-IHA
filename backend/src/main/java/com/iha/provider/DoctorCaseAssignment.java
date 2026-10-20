package com.iha.provider;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * An admin's invitation for a doctor to evaluate a case. Several doctors can
 * be invited to one case; each accepts, evaluates and proposes a plan on
 * their own (tracked here, not on the case).
 */
@Entity
@Table(name = "doctor_case_assignments")
public class DoctorCaseAssignment {

	public static final String INVITED = "invited";
	public static final String ACCEPTED = "accepted";
	public static final String DECLINED = "declined";
	public static final String WITHDRAWN = "withdrawn";
	public static final String CANCELLED = "cancelled";

	@Id
	private UUID id;

	@Column(name = "case_id", nullable = false, updatable = false)
	private UUID caseId;

	@Column(name = "doctor_id", nullable = false, updatable = false)
	private UUID doctorId;

	@Column(nullable = false)
	private String status;

	@Column(name = "decline_reason")
	private String declineReason;

	@Column(name = "invited_at", nullable = false, updatable = false)
	private Instant invitedAt;

	@Column(name = "responded_at")
	private Instant respondedAt;

	@Column(name = "evaluation_started_at")
	private Instant evaluationStartedAt;

	@Column(name = "plan_submitted_at")
	private Instant planSubmittedAt;

	protected DoctorCaseAssignment() {
	}

	public DoctorCaseAssignment(UUID caseId, UUID doctorId) {
		this.id = UUID.randomUUID();
		this.caseId = caseId;
		this.doctorId = doctorId;
		this.status = INVITED;
		this.invitedAt = Instant.now();
	}

	public boolean isAccepted() {
		return ACCEPTED.equals(status);
	}

	public void respond(String status, String declineReason) {
		this.status = status;
		this.respondedAt = Instant.now();
		if (DECLINED.equals(status)) {
			this.declineReason = declineReason;
		}
	}

	public void markEvaluationStarted() {
		this.evaluationStartedAt = Instant.now();
	}

	public void markPlanSubmitted() {
		this.planSubmittedAt = Instant.now();
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

	public String getDeclineReason() {
		return declineReason;
	}

	public Instant getInvitedAt() {
		return invitedAt;
	}

	public Instant getRespondedAt() {
		return respondedAt;
	}

	public Instant getEvaluationStartedAt() {
		return evaluationStartedAt;
	}

	public Instant getPlanSubmittedAt() {
		return planSubmittedAt;
	}

}
