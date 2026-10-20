package com.iha.visa;

import java.time.Instant;
import java.util.Set;
import java.util.UUID;

import com.iha.crypto.EncryptedStringConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * A patient's subclass 602 visa application for a case. {@code not_started}
 * exists once documents are uploaded; submitting the form moves it to
 * {@code documents_submitted}, after which the lawyer drives the status.
 */
@Entity
@Table(name = "visa_submissions")
public class VisaSubmission {

	public static final String NOT_STARTED = "not_started";
	public static final String DOCUMENTS_SUBMITTED = "documents_submitted";
	public static final String PROCESSING = "processing";
	public static final String APPROVED = "approved";
	public static final String REJECTED = "rejected";

	/** The patient can no longer add documents once the lawyer has lodged the application. */
	public static final Set<String> UPLOAD_LOCKED = Set.of("application_submitted", PROCESSING, APPROVED, REJECTED);

	@Id
	private UUID id;

	@Column(name = "case_id", nullable = false, updatable = false)
	private UUID caseId;

	@Column(name = "patient_id", nullable = false, updatable = false)
	private UUID patientId;

	@Column(name = "assigned_lawyer_id")
	private UUID assignedLawyerId;

	@Column(nullable = false)
	private String status;

	/** The wizard's answers as JSON (snake_case keys, same as the old form_data). */
	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "form_data_enc")
	private String formDataJson;

	@Column(name = "rejection_reason")
	private String rejectionReason;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected VisaSubmission() {
	}

	VisaSubmission(UUID caseId, UUID patientId) {
		this.id = UUID.randomUUID();
		this.caseId = caseId;
		this.patientId = patientId;
		this.status = NOT_STARTED;
		this.createdAt = Instant.now();
		this.updatedAt = createdAt;
	}

	@PreUpdate
	void touch() {
		updatedAt = Instant.now();
	}

	public boolean isFormSubmitted() {
		return !NOT_STARTED.equals(status);
	}

	void submit(String formDataJson) {
		this.formDataJson = formDataJson;
		this.status = DOCUMENTS_SUBMITTED;
	}

	/** Used by the visa portal port and tests. */
	public void assignLawyer(UUID lawyerId) {
		this.assignedLawyerId = lawyerId;
	}

	public UUID getId() {
		return id;
	}

	public UUID getCaseId() {
		return caseId;
	}

	public UUID getPatientId() {
		return patientId;
	}

	public UUID getAssignedLawyerId() {
		return assignedLawyerId;
	}

	public String getStatus() {
		return status;
	}

	public String getFormDataJson() {
		return formDataJson;
	}

	public String getRejectionReason() {
		return rejectionReason;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

}
