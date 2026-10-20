package com.iha.treatment;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import com.iha.crypto.EncryptedDecimalConverter;
import com.iha.crypto.EncryptedStringConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** An additional specialist (anaesthetist, radiologist, …) costed into a plan. */
@Entity
@Table(name = "treatment_plan_specialists")
public class TreatmentPlanSpecialist {

	@Id
	private UUID id;

	@Column(name = "treatment_plan_id", nullable = false, updatable = false)
	private UUID treatmentPlanId;

	@Column(name = "specialist_type", nullable = false)
	private String specialistType;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "specialist_name_enc")
	private String specialistName;

	@Convert(converter = EncryptedDecimalConverter.class)
	@Column(name = "cost_aud_enc", nullable = false)
	private BigDecimal costAud;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "notes_enc")
	private String notes;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected TreatmentPlanSpecialist() {
	}

	public TreatmentPlanSpecialist(UUID treatmentPlanId, String specialistType, String specialistName,
			BigDecimal costAud) {
		this.id = UUID.randomUUID();
		this.treatmentPlanId = treatmentPlanId;
		this.specialistType = specialistType;
		this.specialistName = specialistName;
		this.costAud = costAud;
		this.createdAt = Instant.now();
	}

	public UUID getTreatmentPlanId() {
		return treatmentPlanId;
	}

	public String getSpecialistType() {
		return specialistType;
	}

	public String getSpecialistName() {
		return specialistName;
	}

	public BigDecimal getCostAud() {
		return costAud;
	}

	public String getNotes() {
		return notes;
	}

}
