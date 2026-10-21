package com.iha.fees;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** History of fee changes made in the admin portal. */
@Entity
@Table(name = "platform_fee_changes")
public class PlatformFeeChange {

	@Id
	private UUID id;

	@Column(name = "fee_key", nullable = false, updatable = false)
	private String feeKey;

	@Column(name = "old_amount", updatable = false)
	private BigDecimal oldAmount;

	@Column(name = "new_amount", nullable = false, updatable = false)
	private BigDecimal newAmount;

	@Column(name = "reason", updatable = false)
	private String reason;

	@Column(name = "changed_by", updatable = false)
	private String changedBy;

	@Column(name = "changed_at", nullable = false, updatable = false)
	private Instant changedAt;

	protected PlatformFeeChange() {
	}

	PlatformFeeChange(String feeKey, BigDecimal oldAmount, BigDecimal newAmount, String reason, String changedBy) {
		this.id = UUID.randomUUID();
		this.feeKey = feeKey;
		this.oldAmount = oldAmount;
		this.newAmount = newAmount;
		this.reason = reason;
		this.changedBy = changedBy;
		this.changedAt = Instant.now();
	}

	public UUID getId() {
		return id;
	}

	public String getFeeKey() {
		return feeKey;
	}

	public BigDecimal getOldAmount() {
		return oldAmount;
	}

	public BigDecimal getNewAmount() {
		return newAmount;
	}

	public String getReason() {
		return reason;
	}

	public String getChangedBy() {
		return changedBy;
	}

	public Instant getChangedAt() {
		return changedAt;
	}

}
