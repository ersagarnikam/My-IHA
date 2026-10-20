package com.iha.doctor;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.iha.auth.CurrentUser;
import com.iha.consultation.ConsultationRequest;
import com.iha.consultation.ConsultationSlot;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/doctor/consultations")
public class DoctorConsultationController {

	private final DoctorConsultationService consultations;

	DoctorConsultationController(DoctorConsultationService consultations) {
		this.consultations = consultations;
	}

	@GetMapping
	public List<ConsultationResponse> list(@AuthenticationPrincipal Jwt jwt) {
		return consultations.list(CurrentUser.from(jwt)).stream().map(ConsultationResponse::of).toList();
	}

	@GetMapping("/{requestId}")
	public ConsultationResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requestId) {
		return ConsultationResponse.of(consultations.get(CurrentUser.from(jwt), requestId));
	}

	@PostMapping("/{requestId}/slots")
	public ConsultationResponse proposeSlots(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requestId,
			@RequestBody ProposeSlotsRequest request) {
		return ConsultationResponse.of(consultations.proposeSlots(CurrentUser.from(jwt), requestId, request.slots()));
	}

	@PostMapping("/{requestId}/cancel")
	public ConsultationResponse cancel(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requestId,
			@Valid @RequestBody CancelRequest request) {
		return ConsultationResponse.of(consultations.cancel(CurrentUser.from(jwt), requestId, request.reason()));
	}

	public record ProposeSlotsRequest(List<DoctorConsultationService.SlotInput> slots) {
	}

	public record CancelRequest(@NotBlank @Size(max = 500) String reason) {
	}

	public record SlotResponse(UUID id, Instant slotTime, Instant slotEndTime) {
	}

	/** {@code kind}: initial (before the plan) or option (about a published treatment option). */
	public record ConsultationResponse(UUID id, String kind, UUID caseId, String caseReference, String patientName,
			String procedureName, LocalDate treatmentStartDate, String status, Instant requestedAt, Instant updatedAt,
			UUID selectedSlotId, String zoomLink, String cancellationReason, List<SlotResponse> slots) {

		static ConsultationResponse of(DoctorConsultationService.ConsultationView v) {
			ConsultationRequest r = v.request();
			return new ConsultationResponse(r.getId(), r.getKind(), r.getCaseId(), v.caseReference(), v.patientName(),
					v.procedureName(), v.treatmentStartDate(), r.getStatus(), r.getRequestedAt(), r.getUpdatedAt(),
					r.getSelectedSlotId(), r.getZoomLink(), r.getCancellationReason(),
					v.slots().stream()
						.map((ConsultationSlot s) -> new SlotResponse(s.getId(), s.getSlotTime(), s.getSlotEndTime()))
						.toList());
		}

	}

}
