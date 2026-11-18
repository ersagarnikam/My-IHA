package com.iha.providerfee;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A hospital's or visa lawyer's one-off registration fee or a yearly renewal. */
@Entity
@Table(name = "provider_fee_payments")
public class ProviderFeePayment {

	public static final String REGISTRATION = "registration";
	public static final String ANNUAL = "annual";

	public static final String PENDING = "pending";
	public static final String COMPLETED = "completed";
	public static final String FAILED = "failed";
	public static final String REFUNDED = "refunded";

	@Id
	private UUID id;

	/** {@code hospital} or {@code lawyer}. */
	@Column(name = "provider_type", nullable = false, updatable = false)
	private String providerType;

	@Column(name = "provider_id", nullable = false, updatable = false)
	private UUID providerId;

	@Column(name = "fee_type", nullable = false, updatable = false)
	private String feeType;

	@Column(name = "amount_aud", nullable = false, updatable = false)
	private BigDecimal amountAud;

	/** For annual fees: the due date (yyyy-MM-dd) this payment renews. */
	@Column(name = "billing_period", updatable = false)
	private String billingPeriod;

	@Column(nullable = false)
	private String status;

	@Column(nullable = false)
	private String gateway;

	@Column(name = "gateway_reference")
	private String gatewayReference;

	@Column(name = "stripe_payment_intent_id")
	private String paymentIntentId;

	@Column(name = "paid_at")
	private Instant paidAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected ProviderFeePayment() {
	}

	ProviderFeePayment(String providerType, UUID providerId, String feeType, BigDecimal amountAud, String billingPeriod,
			String gateway) {
		this.id = UUID.randomUUID();
		this.providerType = providerType;
		this.providerId = providerId;
		this.feeType = feeType;
		this.amountAud = amountAud;
		this.billingPeriod = billingPeriod;
		this.status = PENDING;
		this.gateway = gateway;
		this.createdAt = Instant.now();
	}

	boolean isPending() {
		return PENDING.equals(status);
	}

	void attachIntent(String intentId) {
		this.paymentIntentId = intentId;
	}

	void complete(String reference) {
		this.status = COMPLETED;
		this.gatewayReference = reference;
		this.paidAt = Instant.now();
	}

	void fail() {
		this.status = FAILED;
	}

	/** Fully refunded; {@code false} moves it back to completed (a refund failed after all). */
	public void setRefunded(boolean refunded) {
		if (paidAt != null) {
			status = refunded ? REFUNDED : COMPLETED;
		}
	}

	public UUID getId() {
		return id;
	}

	public String getProviderType() {
		return providerType;
	}

	public UUID getProviderId() {
		return providerId;
	}

	public String getFeeType() {
		return feeType;
	}

	public BigDecimal getAmountAud() {
		return amountAud;
	}

	public String getBillingPeriod() {
		return billingPeriod;
	}

	public String getStatus() {
		return status;
	}

	public String getGateway() {
		return gateway;
	}

	public String getGatewayReference() {
		return gatewayReference;
	}

	public String getPaymentIntentId() {
		return paymentIntentId;
	}

	public Instant getPaidAt() {
		return paidAt;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

}
