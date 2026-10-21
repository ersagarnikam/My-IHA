package com.iha.fees;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One admin-configured platform fee (seeded in V2 and V7); see {@link FeeSettingsService} for the catalogue. */
@Entity
@Table(name = "platform_fee_settings")
public class PlatformFeeSetting {

	@Id
	private UUID id;

	@Column(name = "fee_key", nullable = false, updatable = false)
	private String feeKey;

	@Column(name = "amount_aud", nullable = false)
	private BigDecimal amountAud;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	@Column(name = "updated_by")
	private String updatedBy;

	protected PlatformFeeSetting() {
	}

	void change(BigDecimal amount, String by) {
		this.amountAud = amount;
		this.updatedBy = by;
		this.updatedAt = Instant.now();
	}

	public String getFeeKey() {
		return feeKey;
	}

	public BigDecimal getAmountAud() {
		return amountAud;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

	public String getUpdatedBy() {
		return updatedBy;
	}

}
