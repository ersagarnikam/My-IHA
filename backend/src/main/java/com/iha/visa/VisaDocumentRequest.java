package com.iha.visa;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A lawyer asking the patient for an extra visa document. */
@Entity
@Table(name = "visa_document_requests")
public class VisaDocumentRequest {

	@Id
	private UUID id;

	@Column(name = "case_id", nullable = false, updatable = false)
	private UUID caseId;

	@Column(name = "lawyer_id", nullable = false, updatable = false)
	private UUID lawyerId;

	@Column(nullable = false)
	private String category;

	@Column(name = "document_type", nullable = false)
	private String documentType;

	private String instructions;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected VisaDocumentRequest() {
	}

	/** Used by the visa portal port and tests. */
	public VisaDocumentRequest(UUID caseId, UUID lawyerId, String category, String instructions) {
		this.id = UUID.randomUUID();
		this.caseId = caseId;
		this.lawyerId = lawyerId;
		this.category = category;
		this.documentType = category;
		this.instructions = instructions;
		this.createdAt = Instant.now();
	}

	public UUID getId() {
		return id;
	}

	public UUID getCaseId() {
		return caseId;
	}

	public String getCategory() {
		return category;
	}

	public String getDocumentType() {
		return documentType;
	}

	public String getInstructions() {
		return instructions;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

}
