package com.iha.treatment;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A plan as offered to the patient: admin adds the MTA commission and publishes
 * it. Clinical and cost details are read from the linked {@link TreatmentPlan}.
 */
@Entity
@Table(name = "treatment_options")
public class TreatmentOption {

	@Id
	private UUID id;

	@Column(name = "case_id", nullable = false, updatable = false)
	private UUID caseId;

	@Column(name = "treatment_plan_id", nullable = false, updatable = false)
	private UUID treatmentPlanId;

	@Column(name = "mta_commission_aud", nullable = false)
	private BigDecimal mtaCommissionAud;

	@Column(name = "is_selected", nullable = false)
	private boolean selected;

	@Column(name = "published_at")
	private Instant publishedAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected TreatmentOption() {
	}

	/** Creates a published option (the admin portal port adds the draft → publish flow). */
	public TreatmentOption(UUID caseId, UUID treatmentPlanId, BigDecimal mtaCommissionAud) {
		this.id = UUID.randomUUID();
		this.caseId = caseId;
		this.treatmentPlanId = treatmentPlanId;
		this.mtaCommissionAud = mtaCommissionAud;
		this.createdAt = Instant.now();
		this.publishedAt = createdAt;
	}

	void select() {
		selected = true;
	}

	public UUID getId() {
		return id;
	}

	public UUID getCaseId() {
		return caseId;
	}

	public UUID getTreatmentPlanId() {
		return treatmentPlanId;
	}

	public BigDecimal getMtaCommissionAud() {
		return mtaCommissionAud;
	}

	public boolean isSelected() {
		return selected;
	}

	public Instant getPublishedAt() {
		return publishedAt;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

}
