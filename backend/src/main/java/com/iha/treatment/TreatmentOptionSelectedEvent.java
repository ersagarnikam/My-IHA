package com.iha.treatment;

import java.math.BigDecimal;
import java.util.UUID;

/** Published inside the selection transaction; the payment module creates the pending full payment. */
public record TreatmentOptionSelectedEvent(UUID caseId, UUID patientId, UUID treatmentOptionId, BigDecimal amountAud) {
}
