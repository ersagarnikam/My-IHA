package com.iha.refund;

import java.util.UUID;

/**
 * Published inside the refund transaction. {@code fullyRefunded}: nothing of the
 * payment is left. The consultation module cancels a fully refunded consultation
 * that hasn't taken place.
 */
public record PaymentRefundedEvent(String paymentKind, UUID paymentId, UUID caseId, UUID consultationRequestId,
		String paymentType, boolean fullyRefunded, String reasonLabel) {
}
