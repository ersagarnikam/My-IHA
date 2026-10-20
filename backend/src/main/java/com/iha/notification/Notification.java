package com.iha.notification;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "notifications")
public class Notification {

	@Id
	private UUID id;

	@Column(name = "user_id", nullable = false)
	private UUID userId;

	@Column(name = "case_id")
	private UUID caseId;

	@Column(name = "assignment_id")
	private UUID assignmentId;

	@Column(nullable = false)
	private String type;

	@Column(nullable = false)
	private String title;

	@Column(nullable = false)
	private String message;

	@Column(nullable = false)
	private boolean read;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected Notification() {
	}

	Notification(UUID userId, UUID caseId, UUID assignmentId, String type, String title, String message) {
		this.id = UUID.randomUUID();
		this.userId = userId;
		this.caseId = caseId;
		this.assignmentId = assignmentId;
		this.type = type;
		this.title = title;
		this.message = message;
		this.createdAt = Instant.now();
	}

	void markRead() {
		read = true;
	}

	public UUID getId() {
		return id;
	}

	public UUID getUserId() {
		return userId;
	}

	public UUID getCaseId() {
		return caseId;
	}

	public UUID getAssignmentId() {
		return assignmentId;
	}

	public String getType() {
		return type;
	}

	public String getTitle() {
		return title;
	}

	public String getMessage() {
		return message;
	}

	public boolean isRead() {
		return read;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

}
