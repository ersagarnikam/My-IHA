package com.iha.treatment;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.iha.crypto.EncryptedDecimalConverter;
import com.iha.crypto.EncryptedStringConverter;
import com.iha.crypto.EncryptedStringListConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * A doctor's treatment plan for a case. Clinical and cost fields are encrypted.
 * The patient portal only reads plans (through published {@link TreatmentOption}s);
 * the doctor portal port adds authoring.
 */
@Entity
@Table(name = "treatment_plans")
public class TreatmentPlan {

	public static final String PRESENTED_TO_PATIENT = "presented_to_patient";
	public static final String PATIENT_CONFIRMED = "patient_confirmed";
	public static final String NOT_SELECTED = "not_selected";
	public static final String REJECTED_BY_IHA = "rejected_by_iha";

	@Id
	private UUID id;

	@Column(name = "case_id", nullable = false, updatable = false)
	private UUID caseId;

	@Column(name = "doctor_id", nullable = false, updatable = false)
	private UUID doctorId;

	@Column(name = "hospital_id")
	private UUID hospitalId;

	@Column(nullable = false)
	private String status;

	@Column(name = "treatment_type")
	private String treatmentType;

	private String department;

	@Column(name = "room_category")
	private String roomCategory;

	@Column(name = "treatment_duration_days")
	private Integer treatmentDurationDays;

	@Column(name = "treatment_start_date")
	private LocalDate treatmentStartDate;

	@Column(name = "treatment_end_date")
	private LocalDate treatmentEndDate;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "diagnosis_enc")
	private String diagnosis;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "procedure_name_enc")
	private String procedureName;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "technique_enc")
	private String technique;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "description_enc")
	private String description;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "expected_outcome_enc")
	private String expectedOutcome;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "success_rate_enc")
	private String successRate;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "recovery_time_enc")
	private String recoveryTime;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "estimated_length_of_stay_enc")
	private String estimatedLengthOfStay;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "special_requirements_enc")
	private String specialRequirements;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "patient_instructions_enc")
	private String patientInstructions;

	@Convert(converter = EncryptedStringListConverter.class)
	@Column(name = "aftercare_enc", nullable = false)
	private List<String> aftercare;

	/** JSON {@code {"items": [{"label", "amount"}]}} of extra doctor-entered cost lines. */
	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "cost_breakdown_enc", nullable = false)
	private String costBreakdownJson;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "cost_notes_enc")
	private String costNotes;

	@Convert(converter = EncryptedDecimalConverter.class)
	@Column(name = "doctor_fees_aud_enc")
	private BigDecimal doctorFeesAud;

	@Convert(converter = EncryptedDecimalConverter.class)
	@Column(name = "hospital_fees_aud_enc")
	private BigDecimal hospitalFeesAud;

	@Column(name = "submitted_at")
	private Instant submittedAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected TreatmentPlan() {
	}

	/** Minimal constructor for tests and seed data until plan authoring is ported. */
	public TreatmentPlan(UUID caseId, UUID doctorId, UUID hospitalId, String procedureName, BigDecimal doctorFeesAud,
			BigDecimal hospitalFeesAud) {
		this.id = UUID.randomUUID();
		this.caseId = caseId;
		this.doctorId = doctorId;
		this.hospitalId = hospitalId;
		this.status = PRESENTED_TO_PATIENT;
		this.procedureName = procedureName;
		this.doctorFeesAud = doctorFeesAud;
		this.hospitalFeesAud = hospitalFeesAud;
		this.aftercare = List.of();
		this.costBreakdownJson = "{\"items\":[]}";
		this.createdAt = Instant.now();
		this.updatedAt = createdAt;
	}

	@PreUpdate
	void touch() {
		updatedAt = Instant.now();
	}

	public void setStatus(String status) {
		this.status = status;
	}

	public UUID getId() {
		return id;
	}

	public UUID getCaseId() {
		return caseId;
	}

	public UUID getDoctorId() {
		return doctorId;
	}

	public UUID getHospitalId() {
		return hospitalId;
	}

	public String getStatus() {
		return status;
	}

	public String getTreatmentType() {
		return treatmentType;
	}

	public String getDepartment() {
		return department;
	}

	public String getRoomCategory() {
		return roomCategory;
	}

	public Integer getTreatmentDurationDays() {
		return treatmentDurationDays;
	}

	public LocalDate getTreatmentStartDate() {
		return treatmentStartDate;
	}

	public LocalDate getTreatmentEndDate() {
		return treatmentEndDate;
	}

	public String getDiagnosis() {
		return diagnosis;
	}

	public String getProcedureName() {
		return procedureName;
	}

	public String getTechnique() {
		return technique;
	}

	public String getDescription() {
		return description;
	}

	public String getExpectedOutcome() {
		return expectedOutcome;
	}

	public String getSuccessRate() {
		return successRate;
	}

	public String getRecoveryTime() {
		return recoveryTime;
	}

	public String getEstimatedLengthOfStay() {
		return estimatedLengthOfStay;
	}

	public String getSpecialRequirements() {
		return specialRequirements;
	}

	public String getPatientInstructions() {
		return patientInstructions;
	}

	public List<String> getAftercare() {
		return aftercare;
	}

	public String getCostBreakdownJson() {
		return costBreakdownJson;
	}

	public String getCostNotes() {
		return costNotes;
	}

	public BigDecimal getDoctorFeesAud() {
		return doctorFeesAud;
	}

	public BigDecimal getHospitalFeesAud() {
		return hospitalFeesAud;
	}

}
