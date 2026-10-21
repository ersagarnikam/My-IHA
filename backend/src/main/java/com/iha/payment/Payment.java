package com.iha.payment;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A patient payment: the full treatment payment or a consultation fee. */
@Entity
@Table(name = "payments")
public class Payment {

	public static final String FULL_PAYMENT = "full_payment";
	public static final String CONSULTATION_FEE = "consultation_fee";

	public static final String PENDING = "pending";
	public static final String COMPLETED = "completed";
	public static final String FAILED = "failed";

	public static final String REFUNDED = "refunded";

	@Id
	private UUID id;

	@Column(name = "case_id", nullable = false, updatable = false)
	private UUID caseId;

	@Column(name = "patient_id", nullable = false, updatable = false)
	private UUID patientId;

	@Column(name = "treatment_option_id", updatable = false)
	private UUID treatmentOptionId;

	@Column(name = "consultation_request_id", updatable = false)
	private UUID consultationRequestId;

	@Column(name = "payment_type", nullable = false, updatable = false)
	private String paymentType;

	@Column(name = "amount_aud", nullable = false)
	private BigDecimal amountAud;

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

	protected Payment() {
	}

	private Payment(UUID caseId, UUID patientId, UUID treatmentOptionId, UUID consultationRequestId, String paymentType,
			BigDecimal amountAud, String gateway) {
		this.id = UUID.randomUUID();
		this.caseId = caseId;
		this.patientId = patientId;
		this.treatmentOptionId = treatmentOptionId;
		this.consultationRequestId = consultationRequestId;
		this.paymentType = paymentType;
		this.amountAud = amountAud;
		this.status = PENDING;
		this.gateway = gateway;
		this.createdAt = Instant.now();
	}

	static Payment pendingTreatment(UUID caseId, UUID patientId, UUID treatmentOptionId, BigDecimal amount,
			String gateway) {
		return new Payment(caseId, patientId, treatmentOptionId, null, FULL_PAYMENT, amount, gateway);
	}

	static Payment pendingConsultation(UUID caseId, UUID patientId, UUID consultationRequestId, BigDecimal amount,
			String gateway) {
		return new Payment(caseId, patientId, null, consultationRequestId, CONSULTATION_FEE, amount, gateway);
	}

	void attachIntent(String intentId) {
		this.paymentIntentId = intentId;
	}

	void complete(String gatewayReference) {
		status = COMPLETED;
		paidAt = Instant.now();
		this.gatewayReference = gatewayReference;
	}

	void fail() {
		status = FAILED;
	}

	/** Fully refunded; {@code false} moves it back to completed (a refund failed after all). */
	public void setRefunded(boolean refunded) {
		if (paidAt != null) {
			status = refunded ? REFUNDED : COMPLETED;
		}
	}

	public boolean isPending() {
		return PENDING.equals(status);
	}

	public boolean isCompleted() {
		return COMPLETED.equals(status);
	}

	public UUID getId() {
		return id;
	}

	public UUID getCaseId() {
		return caseId;
	}

	public UUID getPatientId() {
		return patientId;
	}

	public UUID getTreatmentOptionId() {
		return treatmentOptionId;
	}

	public UUID getConsultationRequestId() {
		return consultationRequestId;
	}

	public String getPaymentType() {
		return paymentType;
	}

	public BigDecimal getAmountAud() {
		return amountAud;
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
