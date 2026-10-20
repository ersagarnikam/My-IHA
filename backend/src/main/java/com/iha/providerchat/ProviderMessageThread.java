package com.iha.providerchat;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * The single support thread between a provider account (doctor, hospital or
 * lawyer) and MTA admins. Starts closed; only an admin opens it.
 */
@Entity
@Table(name = "provider_message_threads")
public class ProviderMessageThread {

	public static final String OPEN = "open";
	public static final String CLOSED = "closed";

	@Id
	private UUID id;

	@Column(name = "account_type", nullable = false, updatable = false)
	private String accountType;

	@Column(name = "hospital_id", updatable = false)
	private UUID hospitalId;

	@Column(name = "doctor_id", updatable = false)
	private UUID doctorId;

	@Column(name = "lawyer_id", updatable = false)
	private UUID lawyerId;

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

	protected ProviderMessageThread() {
	}

	ProviderMessageThread(ProviderAccount account) {
		this.id = UUID.randomUUID();
		this.accountType = account.type();
		switch (account.type()) {
			case ProviderAccount.DOCTOR -> this.doctorId = account.id();
			case ProviderAccount.HOSPITAL -> this.hospitalId = account.id();
			case ProviderAccount.LAWYER -> this.lawyerId = account.id();
			default -> throw new IllegalArgumentException(account.type());
		}
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

	public String getAccountType() {
		return accountType;
	}

	public UUID getHospitalId() {
		return hospitalId;
	}

	public UUID getDoctorId() {
		return doctorId;
	}

	public UUID getLawyerId() {
		return lawyerId;
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
