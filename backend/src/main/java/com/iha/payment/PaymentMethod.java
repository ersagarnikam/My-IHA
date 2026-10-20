package com.iha.payment;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A saved card (the card itself lives at the payment provider; this is the display copy). */
@Entity
@Table(name = "payment_methods")
public class PaymentMethod {

	@Id
	private UUID id;

	@Column(name = "user_id", nullable = false, updatable = false)
	private UUID userId;

	@Column(name = "stripe_payment_method_id", nullable = false, updatable = false)
	private String providerMethodId;

	@Column(nullable = false)
	private String brand;

	@Column(nullable = false)
	private String last4;

	@Column(name = "exp_month", nullable = false)
	private int expMonth;

	@Column(name = "exp_year", nullable = false)
	private int expYear;

	@Column(name = "is_default", nullable = false)
	private boolean defaultMethod;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected PaymentMethod() {
	}

	PaymentMethod(UUID userId, PaymentGateway.Card card, boolean defaultMethod) {
		this.id = UUID.randomUUID();
		this.userId = userId;
		this.providerMethodId = card.paymentMethodId();
		this.brand = card.brand();
		this.last4 = card.last4();
		this.expMonth = card.expMonth();
		this.expYear = card.expYear();
		this.defaultMethod = defaultMethod;
		this.createdAt = Instant.now();
	}

	void setDefault(boolean defaultMethod) {
		this.defaultMethod = defaultMethod;
	}

	public UUID getId() {
		return id;
	}

	public String getProviderMethodId() {
		return providerMethodId;
	}

	public String getBrand() {
		return brand;
	}

	public String getLast4() {
		return last4;
	}

	public int getExpMonth() {
		return expMonth;
	}

	public int getExpYear() {
		return expYear;
	}

	public boolean isDefaultMethod() {
		return defaultMethod;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

}
