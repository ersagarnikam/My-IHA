package com.iha.refund;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A refund issued by MTA admin. {@code amountAud} is the part of the payment
 * being refunded; the card processing fee is deducted from it, and
 * {@code refundedAud} is what goes back to the card.
 */
@Entity
@Table(name = "payment_refunds")
public class PaymentRefund {

	public static final String PENDING = "pending";
	public static final String SUCCEEDED = "succeeded";
	public static final String FAILED = "failed";

	@Id
	private UUID id;

	@Column(name = "payment_kind", nullable = false, updatable = false)
	private String paymentKind;

	@Column(name = "payment_id", nullable = false, updatable = false)
	private UUID paymentId;

	@Column(name = "case_id", updatable = false)
	private UUID caseId;

	@Column(name = "amount_aud", nullable = false, updatable = false)
	private BigDecimal amountAud;

	@Column(name = "fee_deducted_aud", nullable = false, updatable = false)
	private BigDecimal feeDeductedAud;

	@Column(name = "refunded_aud", nullable = false, updatable = false)
	private BigDecimal refundedAud;

	/** stripe (the provider's real fee), estimate (fee settings), waived or none. */
	@Column(name = "fee_source", nullable = false, updatable = false)
	private String feeSource;

	@Column(nullable = false, updatable = false)
	private String reason;

	@Column(updatable = false)
	private String note;

	@Column(nullable = false)
	private String status;

	@Column(nullable = false, updatable = false)
	private String gateway;

	@Column(name = "gateway_refund_id")
	private String gatewayRefundId;

	@Column(name = "created_by", updatable = false)
	private String createdBy;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "completed_at")
	private Instant completedAt;

	protected PaymentRefund() {
	}

	PaymentRefund(String paymentKind, UUID paymentId, UUID caseId, BigDecimal amountAud, BigDecimal feeDeductedAud,
			String feeSource, String reason, String note, String gateway, String createdBy) {
		this.id = UUID.randomUUID();
		this.paymentKind = paymentKind;
		this.paymentId = paymentId;
		this.caseId = caseId;
		this.amountAud = amountAud;
		this.feeDeductedAud = feeDeductedAud;
		this.refundedAud = amountAud.subtract(feeDeductedAud);
		this.feeSource = feeSource;
		this.reason = reason;
		this.note = note;
		this.status = PENDING;
		this.gateway = gateway;
		this.createdBy = createdBy;
		this.createdAt = Instant.now();
	}

	void update(String gatewayRefundId, String status) {
		if (gatewayRefundId != null) {
			this.gatewayRefundId = gatewayRefundId;
		}
		this.status = status;
		if (!PENDING.equals(status) && completedAt == null) {
			completedAt = Instant.now();
		}
	}

	public boolean counts() {
		return !FAILED.equals(status);
	}

	public UUID getId() {
		return id;
	}

	public String getPaymentKind() {
		return paymentKind;
	}

	public UUID getPaymentId() {
		return paymentId;
	}

	public UUID getCaseId() {
		return caseId;
	}

	public BigDecimal getAmountAud() {
		return amountAud;
	}

	public BigDecimal getFeeDeductedAud() {
		return feeDeductedAud;
	}

	public BigDecimal getRefundedAud() {
		return refundedAud;
	}

	public String getFeeSource() {
		return feeSource;
	}

	public String getReason() {
		return reason;
	}

	public String getNote() {
		return note;
	}

	public String getStatus() {
		return status;
	}

	public String getGateway() {
		return gateway;
	}

	public String getGatewayRefundId() {
		return gatewayRefundId;
	}

	public String getCreatedBy() {
		return createdBy;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getCompletedAt() {
		return completedAt;
	}

}
