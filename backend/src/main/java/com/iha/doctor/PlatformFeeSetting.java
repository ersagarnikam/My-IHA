package com.iha.doctor;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** Admin-configured platform fees (seeded in V2). */
@Entity
@Table(name = "platform_fee_settings")
public class PlatformFeeSetting {

	public static final String DOCTOR_REGISTRATION_FEE = "doctor_registration_fee";
	public static final String DOCTOR_ANNUAL_FEE = "doctor_annual_fee";

	@Id
	private UUID id;

	@Column(name = "fee_key", nullable = false, updatable = false)
	private String feeKey;

	@Column(name = "amount_aud", nullable = false)
	private BigDecimal amountAud;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected PlatformFeeSetting() {
	}

	public String getFeeKey() {
		return feeKey;
	}

	public BigDecimal getAmountAud() {
		return amountAud;
	}

}
