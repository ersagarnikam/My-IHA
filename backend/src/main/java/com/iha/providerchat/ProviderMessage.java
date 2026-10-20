package com.iha.providerchat;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "provider_messages")
public class ProviderMessage {

	public static final String ADMIN = "admin";

	@Id
	private UUID id;

	@Column(name = "thread_id", nullable = false, updatable = false)
	private UUID threadId;

	@Column(name = "sender_id", nullable = false, updatable = false)
	private UUID senderId;

	@Column(name = "sender_type", nullable = false, updatable = false)
	private String senderType;

	@Column(nullable = false, updatable = false)
	private String body;

	@Column(nullable = false)
	private boolean read;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected ProviderMessage() {
	}

	ProviderMessage(UUID threadId, UUID senderId, String senderType, String body) {
		this.id = UUID.randomUUID();
		this.threadId = threadId;
		this.senderId = senderId;
		this.senderType = senderType;
		this.body = body;
		this.createdAt = Instant.now();
	}

	public UUID getId() {
		return id;
	}

	public UUID getThreadId() {
		return threadId;
	}

	public String getSenderType() {
		return senderType;
	}

	public String getBody() {
		return body;
	}

	public boolean isRead() {
		return read;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

}
