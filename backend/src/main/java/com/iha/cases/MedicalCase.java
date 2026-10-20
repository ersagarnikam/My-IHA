package com.iha.cases;

import java.time.Instant;
import java.util.UUID;

import com.iha.crypto.EncryptedStringConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/** A patient's case ({@code cases} table; named to avoid the {@code case} keyword). */
@Entity
@Table(name = "cases")
public class MedicalCase {

	@Id
	private UUID id;

	@Column(name = "patient_id", nullable = false, updatable = false)
	private UUID patientId;

	@Column(name = "reference_number", nullable = false, updatable = false)
	private String referenceNumber;

	@Column(nullable = false)
	private String specialty;

	@Column(name = "specialty_other")
	private String specialtyOther;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "description_enc", nullable = false)
	private String description;

	@Column(nullable = false)
	private CaseStatus status;

	@Column(name = "need_travel_assistance", nullable = false)
	private boolean needTravelAssistance;

	@Column(name = "need_stay_booking_assistance", nullable = false)
	private boolean needStayBookingAssistance;

	@Column(name = "need_transportation_assistance", nullable = false)
	private boolean needTransportationAssistance;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected MedicalCase() {
	}

	MedicalCase(UUID patientId, String referenceNumber, String specialty, String specialtyOther, String description) {
		this.id = UUID.randomUUID();
		this.patientId = patientId;
		this.referenceNumber = referenceNumber;
		this.specialty = specialty;
		this.specialtyOther = specialtyOther;
		this.description = description;
		this.status = CaseStatus.CASE_SUBMITTED;
		this.createdAt = Instant.now();
		this.updatedAt = this.createdAt;
	}

	@PreUpdate
	void touch() {
		updatedAt = Instant.now();
	}

	void setStatus(CaseStatus status) {
		this.status = status;
	}

	void updateTravelAssistance(boolean travel, boolean stay, boolean transportation) {
		this.needTravelAssistance = travel;
		this.needStayBookingAssistance = stay;
		this.needTransportationAssistance = transportation;
	}

	public UUID getId() {
		return id;
	}

	public UUID getPatientId() {
		return patientId;
	}

	public String getReferenceNumber() {
		return referenceNumber;
	}

	public String getSpecialty() {
		return specialty;
	}

	public String getSpecialtyOther() {
		return specialtyOther;
	}

	public String getDescription() {
		return description;
	}

	public CaseStatus getStatus() {
		return status;
	}

	public boolean isNeedTravelAssistance() {
		return needTravelAssistance;
	}

	public boolean isNeedStayBookingAssistance() {
		return needStayBookingAssistance;
	}

	public boolean isNeedTransportationAssistance() {
		return needTransportationAssistance;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

}
