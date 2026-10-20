package com.iha.audit;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "audit_logs")
public class AuditLog {

	@Id
	private UUID id;

	@Column(name = "actor_id")
	private UUID actorId;

	@Column(name = "actor_email")
	private String actorEmail;

	@Column(nullable = false)
	private String app;

	@Column(nullable = false)
	private String action;

	@Column(name = "entity_type")
	private String entityType;

	@Column(name = "entity_id")
	private String entityId;

	/** JSON object text. */
	@Column(nullable = false)
	private String metadata;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected AuditLog() {
	}

	AuditLog(UUID actorId, String actorEmail, String app, String action, String entityType, String entityId,
			String metadata) {
		this.id = UUID.randomUUID();
		this.actorId = actorId;
		this.actorEmail = actorEmail;
		this.app = app;
		this.action = action;
		this.entityType = entityType;
		this.entityId = entityId;
		this.metadata = metadata;
		this.createdAt = Instant.now();
	}

	public String getAction() {
		return action;
	}

	public String getEntityId() {
		return entityId;
	}

	public String getMetadata() {
		return metadata;
	}

}
