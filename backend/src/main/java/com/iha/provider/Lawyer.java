package com.iha.provider;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A visa lawyer account. Only the columns the patient portal reads are mapped
 * so far; the visa portal port adds registration and profile fields.
 */
@Entity
@Table(name = "lawyers")
public class Lawyer {

	@Id
	private UUID id;

	@Column(name = "user_id")
	private UUID userId;

	@Column(nullable = false)
	private String name;

	@Column(name = "lawyer_type", nullable = false)
	private String lawyerType;

	@Column(nullable = false)
	private String status;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected Lawyer() {
	}

	/** For tests and seed data until lawyer registration is ported. */
	public Lawyer(UUID userId, String name) {
		this.id = UUID.randomUUID();
		this.userId = userId;
		this.name = name;
		this.lawyerType = "individual";
		this.status = "approved";
		this.createdAt = Instant.now();
		this.updatedAt = createdAt;
	}

	public UUID getId() {
		return id;
	}

	public UUID getUserId() {
		return userId;
	}

	public String getName() {
		return name;
	}

}
