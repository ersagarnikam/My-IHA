package com.iha.visa;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A confidential note the lawyer keeps on a visa case; never shown to the patient. */
@Entity
@Table(name = "visa_case_notes")
public class VisaCaseNote {

	@Id
	private UUID id;

	@Column(name = "case_id", nullable = false, updatable = false)
	private UUID caseId;

	@Column(name = "lawyer_id", nullable = false, updatable = false)
	private UUID lawyerId;

	@Column(nullable = false, updatable = false)
	private String body;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected VisaCaseNote() {
	}

	public VisaCaseNote(UUID caseId, UUID lawyerId, String body) {
		this.id = UUID.randomUUID();
		this.caseId = caseId;
		this.lawyerId = lawyerId;
		this.body = body;
		this.createdAt = Instant.now();
	}

	public UUID getId() {
		return id;
	}

	public UUID getCaseId() {
		return caseId;
	}

	public UUID getLawyerId() {
		return lawyerId;
	}

	public String getBody() {
		return body;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

}
