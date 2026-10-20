package com.iha.doctor;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A document type the doctor asked the patient for; received once the patient adds one to the case. */
@Entity
@Table(name = "case_document_requests")
public class CaseDocumentRequest {

	public static final String PENDING = "pending";
	public static final String RECEIVED = "received";

	@Id
	private UUID id;

	@Column(name = "case_id", nullable = false, updatable = false)
	private UUID caseId;

	@Column(name = "doctor_id", nullable = false, updatable = false)
	private UUID doctorId;

	@Column(name = "document_type", nullable = false, updatable = false)
	private String documentType;

	@Column(updatable = false)
	private String message;

	@Column(nullable = false)
	private String status;

	@Column(name = "requested_at", nullable = false, updatable = false)
	private Instant requestedAt;

	@Column(name = "received_at")
	private Instant receivedAt;

	protected CaseDocumentRequest() {
	}

	CaseDocumentRequest(UUID caseId, UUID doctorId, String documentType, String message) {
		this.id = UUID.randomUUID();
		this.caseId = caseId;
		this.doctorId = doctorId;
		this.documentType = documentType;
		this.message = message;
		this.status = PENDING;
		this.requestedAt = Instant.now();
	}

	void markReceived() {
		this.status = RECEIVED;
		this.receivedAt = Instant.now();
	}

	public UUID getId() {
		return id;
	}

	public UUID getCaseId() {
		return caseId;
	}

	public String getDocumentType() {
		return documentType;
	}

	public String getMessage() {
		return message;
	}

	public String getStatus() {
		return status;
	}

	public Instant getRequestedAt() {
		return requestedAt;
	}

	public Instant getReceivedAt() {
		return receivedAt;
	}

}
