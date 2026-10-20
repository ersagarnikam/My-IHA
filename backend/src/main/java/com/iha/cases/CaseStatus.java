package com.iha.cases;

import java.util.Locale;

import com.fasterxml.jackson.annotation.JsonValue;
import com.iha.common.DbEnum;
import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** The case lifecycle, in journey order. Values match {@code cases_status_check}. */
public enum CaseStatus implements DbEnum {

	CASE_SUBMITTED, UNDER_REVIEW, DOCTOR_ASSIGNED, EVALUATION, TREATMENT_PLAN, TREATMENT_CONFIRMED,
	PAYMENT_CONFIRMED, VISA_DOCUMENTS_SUBMITTED, VISA_PROCESSING, TRAVEL_READY, VISA_REJECTED, COMPLETED, CLOSED;

	/** In progress = everything except the terminal states (old isInProgress). */
	public boolean isInProgress() {
		return this != COMPLETED && this != CLOSED && this != VISA_REJECTED;
	}

	/** Treatment options are visible from treatment_plan onwards. */
	public boolean isAtOrAfter(CaseStatus other) {
		return ordinal() >= other.ordinal();
	}

	@Override
	@JsonValue
	public String dbValue() {
		return name().toLowerCase(Locale.ROOT);
	}

	@Converter(autoApply = true)
	public static class JpaConverter implements AttributeConverter<CaseStatus, String> {

		@Override
		public String convertToDatabaseColumn(CaseStatus status) {
			return status == null ? null : status.dbValue();
		}

		@Override
		public CaseStatus convertToEntityAttribute(String value) {
			return DbEnum.fromDbValue(CaseStatus.class, value);
		}

	}

}
