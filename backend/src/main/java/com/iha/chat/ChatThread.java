package com.iha.chat;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/** The single support thread between a patient and MTA admins. Starts closed; only an admin opens it. */
@Entity
@Table(name = "chat_threads")
public class ChatThread {

	public static final String OPEN = "open";
	public static final String CLOSED = "closed";

	@Id
	private UUID id;

	@Column(name = "patient_id", nullable = false, updatable = false)
	private UUID patientId;

	@Column(nullable = false)
	private String status;

	@Column(name = "opened_at")
	private Instant openedAt;

	@Column(name = "closed_at")
	private Instant closedAt;

	@Column(name = "reopen_reason")
	private String reopenReason;

	@Column(name = "reopen_requested_at")
	private Instant reopenRequestedAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected ChatThread() {
	}

	ChatThread(UUID patientId) {
		this.id = UUID.randomUUID();
		this.patientId = patientId;
		this.status = CLOSED;
		this.createdAt = Instant.now();
		this.updatedAt = createdAt;
	}

	@PreUpdate
	void touch() {
		updatedAt = Instant.now();
	}

	public boolean isOpen() {
		return OPEN.equals(status);
	}

	void open() {
		status = OPEN;
		openedAt = Instant.now();
		reopenReason = null;
		reopenRequestedAt = null;
	}

	void close() {
		status = CLOSED;
		closedAt = Instant.now();
	}

	void requestReopen(String reason) {
		reopenReason = reason;
		reopenRequestedAt = Instant.now();
	}

	public UUID getId() {
		return id;
	}

	public UUID getPatientId() {
		return patientId;
	}

	public String getStatus() {
		return status;
	}

	public Instant getOpenedAt() {
		return openedAt;
	}

	public Instant getClosedAt() {
		return closedAt;
	}

	public String getReopenReason() {
		return reopenReason;
	}

	public Instant getReopenRequestedAt() {
		return reopenRequestedAt;
	}

}
