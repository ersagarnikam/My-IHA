package com.iha.consultation;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * A patient's request for a paid online consultation about one treatment option.
 * Lifecycle: requested → slots_proposed (doctor) → slot_selected (patient) →
 * scheduled (after payment, with a Zoom link) or cancelled (doctor).
 */
@Entity
@Table(name = "consultation_requests")
public class ConsultationRequest {

	public static final String REQUESTED = "requested";
	public static final String SLOTS_PROPOSED = "slots_proposed";
	public static final String SLOT_SELECTED = "slot_selected";
	public static final String SCHEDULED = "scheduled";
	public static final String CANCELLED = "cancelled";

	/** Before the plan: proposed by the doctor during evaluation. */
	public static final String INITIAL = "initial";

	/** After the plan: requested by the patient about a published treatment option. */
	public static final String OPTION = "option";

	@Id
	private UUID id;

	@Column(name = "case_id", nullable = false, updatable = false)
	private UUID caseId;

	@Column(name = "patient_id", nullable = false, updatable = false)
	private UUID patientId;

	@Column(nullable = false, updatable = false)
	private String kind;

	/** Null for initial consultations. */
	@Column(name = "treatment_option_id", updatable = false)
	private UUID treatmentOptionId;

	/** The doctor for initial consultations; option consultations reach the doctor through the plan. */
	@Column(name = "doctor_id", updatable = false)
	private UUID doctorId;

	@Column(name = "selected_slot_id")
	private UUID selectedSlotId;

	@Column(nullable = false)
	private String status;

	@Column(name = "zoom_link")
	private String zoomLink;

	@Column(name = "cancellation_reason")
	private String cancellationReason;

	@Column(name = "requested_at", nullable = false, updatable = false)
	private Instant requestedAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected ConsultationRequest() {
	}

	ConsultationRequest(UUID caseId, UUID patientId, UUID treatmentOptionId) {
		this.id = UUID.randomUUID();
		this.caseId = caseId;
		this.patientId = patientId;
		this.kind = OPTION;
		this.treatmentOptionId = treatmentOptionId;
		this.status = REQUESTED;
		this.requestedAt = Instant.now();
		this.updatedAt = requestedAt;
	}

	/** A doctor-initiated consultation during evaluation; starts at "slots proposed". */
	public static ConsultationRequest initial(UUID caseId, UUID patientId, UUID doctorId) {
		ConsultationRequest request = new ConsultationRequest(caseId, patientId, null);
		request.kind = INITIAL;
		request.doctorId = doctorId;
		request.status = SLOTS_PROPOSED;
		return request;
	}

	public boolean isInitial() {
		return INITIAL.equals(kind);
	}

	/** Paid and its time has started. */
	public boolean hasTakenPlace(Instant selectedSlotStart) {
		return SCHEDULED.equals(status) && selectedSlotStart != null && !selectedSlotStart.isAfter(Instant.now());
	}

	@PreUpdate
	void touch() {
		updatedAt = Instant.now();
	}

	void selectSlot(UUID slotId) {
		selectedSlotId = slotId;
		status = SLOT_SELECTED;
	}

	/** Used by the doctor portal port and tests. */
	public void proposeSlots() {
		status = SLOTS_PROPOSED;
		selectedSlotId = null;
	}

	/** Doctor-side cancellation (only before the consultation is paid and scheduled). */
	public void cancel(String reason) {
		status = CANCELLED;
		cancellationReason = reason;
	}

	void schedule(String zoomLink) {
		status = SCHEDULED;
		this.zoomLink = zoomLink;
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

	public String getKind() {
		return kind;
	}

	public UUID getDoctorId() {
		return doctorId;
	}

	public UUID getTreatmentOptionId() {
		return treatmentOptionId;
	}

	public UUID getSelectedSlotId() {
		return selectedSlotId;
	}

	public String getStatus() {
		return status;
	}

	public String getZoomLink() {
		return zoomLink;
	}

	public String getCancellationReason() {
		return cancellationReason;
	}

	public Instant getRequestedAt() {
		return requestedAt;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

}
