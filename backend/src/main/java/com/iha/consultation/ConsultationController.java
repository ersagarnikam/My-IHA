package com.iha.consultation;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.iha.auth.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/patient")
public class ConsultationController {

	private final ConsultationService consultations;

	public ConsultationController(ConsultationService consultations) {
		this.consultations = consultations;
	}

	@GetMapping("/consultations")
	public List<ConsultationResponse> all(@AuthenticationPrincipal Jwt jwt) {
		return consultations.forPatient(CurrentUser.from(jwt)).stream().map(ConsultationResponse::of).toList();
	}

	@GetMapping("/cases/{caseId}/consultations")
	public List<ConsultationResponse> forCase(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId) {
		return consultations.forCase(CurrentUser.from(jwt), caseId).stream().map(ConsultationResponse::of).toList();
	}

	@GetMapping("/consultations/{requestId}")
	public ConsultationResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requestId) {
		return ConsultationResponse.of(consultations.get(CurrentUser.from(jwt), requestId));
	}

	@PostMapping("/treatment-options/{optionId}/consultation")
	@ResponseStatus(HttpStatus.CREATED)
	public ConsultationResponse request(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID optionId) {
		return ConsultationResponse.of(consultations.request(CurrentUser.from(jwt), optionId));
	}

	@PostMapping("/consultations/{requestId}/select-slot")
	public ConsultationResponse selectSlot(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID requestId,
			@Valid @RequestBody SelectSlotRequest body) {
		return ConsultationResponse.of(consultations.selectSlot(CurrentUser.from(jwt), requestId, body.slotId()));
	}

	public record SelectSlotRequest(@NotNull UUID slotId) {
	}

	public record SlotResponse(UUID id, Instant slotTime, Instant slotEndTime) {
	}

	/** {@code kind}: {@code initial} (before the plan, proposed by the doctor) or {@code option} (about a published option). */
	public record ConsultationResponse(UUID id, UUID caseId, String kind, String doctorName, UUID treatmentOptionId,
			String status, String zoomLink,
			UUID selectedSlotId, String cancellationReason, Instant requestedAt, Instant updatedAt, BigDecimal feeAud,
			List<SlotResponse> slots) {

		static ConsultationResponse of(ConsultationService.RequestView view) {
			ConsultationRequest r = view.request();
			return new ConsultationResponse(r.getId(), r.getCaseId(), r.getKind(), view.doctorName(),
					r.getTreatmentOptionId(), r.getStatus(),
					r.getZoomLink(), r.getSelectedSlotId(), r.getCancellationReason(), r.getRequestedAt(),
					r.getUpdatedAt(), ConsultationService.CONSULTATION_FEE_AUD,
					view.slots().stream().map(s -> new SlotResponse(s.getId(), s.getSlotTime(), s.getSlotEndTime())).toList());
		}

	}

}
