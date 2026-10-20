package com.iha.cases;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "case_documents")
public class CaseDocument {

	public static final String MEDICAL = "medical";

	@Id
	private UUID id;

	@Column(name = "patient_id", nullable = false, updatable = false)
	private UUID patientId;

	@Column(name = "case_id")
	private UUID caseId;

	@Column(name = "document_category", nullable = false)
	private String documentCategory;

	@Column(name = "document_type", nullable = false)
	private String documentType;

	@Column(name = "file_name", nullable = false)
	private String fileName;

	@Column(name = "file_path", nullable = false)
	private String filePath;

	@Column(name = "file_size_bytes", nullable = false)
	private long fileSizeBytes;

	@Column(name = "mime_type", nullable = false)
	private String mimeType;

	@Column(name = "uploaded_at", nullable = false, updatable = false)
	private Instant uploadedAt;

	protected CaseDocument() {
	}

	CaseDocument(UUID id, UUID patientId, UUID caseId, String documentType, String fileName, String filePath,
			long fileSizeBytes, String mimeType) {
		this.id = id;
		this.patientId = patientId;
		this.caseId = caseId;
		this.documentCategory = MEDICAL;
		this.documentType = documentType;
		this.fileName = fileName;
		this.filePath = filePath;
		this.fileSizeBytes = fileSizeBytes;
		this.mimeType = mimeType;
		this.uploadedAt = Instant.now();
	}

	void linkToCase(UUID caseId, String fileName) {
		this.caseId = caseId;
		this.fileName = fileName;
	}

	public UUID getId() {
		return id;
	}

	public UUID getPatientId() {
		return patientId;
	}

	public UUID getCaseId() {
		return caseId;
	}

	public String getDocumentType() {
		return documentType;
	}

	public String getFileName() {
		return fileName;
	}

	public String getFilePath() {
		return filePath;
	}

	public long getFileSizeBytes() {
		return fileSizeBytes;
	}

	public String getMimeType() {
		return mimeType;
	}

	public Instant getUploadedAt() {
		return uploadedAt;
	}

}
