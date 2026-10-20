package com.iha.consultation;

import java.math.BigDecimal;
import java.util.UUID;

/** Published inside the slot-selection transaction; the payment module creates the pending consultation fee. */
public record ConsultationSlotSelectedEvent(UUID caseId, UUID patientId, UUID consultationRequestId,
		BigDecimal amountAud) {
}
