package com.iha.payment;

import java.util.UUID;

/**
 * Published inside the transaction that marks a payment completed. Consultation
 * and treatment modules react (schedule the meeting / confirm the plan).
 */
public record PaymentCompletedEvent(UUID paymentId, String paymentType, UUID caseId, UUID treatmentOptionId,
		UUID consultationRequestId) {
}
