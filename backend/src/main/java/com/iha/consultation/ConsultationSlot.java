package com.iha.consultation;

import java.time.Instant;
import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** A time the doctor offered for a consultation (stored in UTC; shown in Sydney time and local time). */
@Entity
@Table(name = "consultation_slots")
public class ConsultationSlot {

	@Id
	private UUID id;

	@Column(name = "consultation_request_id", nullable = false, updatable = false)
	private UUID consultationRequestId;

	@Column(name = "slot_time", nullable = false)
	private Instant slotTime;

	@Column(name = "slot_end_time", nullable = false)
	private Instant slotEndTime;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected ConsultationSlot() {
	}

	public ConsultationSlot(UUID consultationRequestId, Instant slotTime, Instant slotEndTime) {
		this.id = UUID.randomUUID();
		this.consultationRequestId = consultationRequestId;
		this.slotTime = slotTime;
		this.slotEndTime = slotEndTime;
		this.createdAt = Instant.now();
	}

	public UUID getId() {
		return id;
	}

	public UUID getConsultationRequestId() {
		return consultationRequestId;
	}

	public Instant getSlotTime() {
		return slotTime;
	}

	public Instant getSlotEndTime() {
		return slotEndTime;
	}

}
