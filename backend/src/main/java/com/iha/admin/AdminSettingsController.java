package com.iha.admin;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.iha.auth.CurrentUser;
import com.iha.fees.FeeSettingsService;
import com.iha.fees.PlatformFeeChange;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

/** MTA admin settings: platform fees and their change history. */
@RestController
@RequestMapping("/api/admin/settings")
public class AdminSettingsController {

	private final FeeSettingsService fees;

	AdminSettingsController(FeeSettingsService fees) {
		this.fees = fees;
	}

	@GetMapping("/fees")
	public FeesResponse fees() {
		return new FeesResponse(fees.all(), fees.history().stream().map(ChangeResponse::of).toList());
	}

	@PutMapping("/fees/{key}")
	public FeeSettingsService.FeeView update(@AuthenticationPrincipal Jwt jwt, @PathVariable String key,
			@Valid @RequestBody UpdateFeeRequest request) {
		return fees.update(CurrentUser.from(jwt), key, request.amount(), request.reason());
	}

	public record UpdateFeeRequest(@NotNull BigDecimal amount, @Size(max = 500) String reason) {
	}

	public record FeesResponse(List<FeeSettingsService.FeeView> fees, List<ChangeResponse> history) {
	}

	public record ChangeResponse(UUID id, String key, BigDecimal oldAmount, BigDecimal newAmount, String reason,
			String changedBy, Instant changedAt) {

		static ChangeResponse of(PlatformFeeChange c) {
			return new ChangeResponse(c.getId(), c.getFeeKey(), c.getOldAmount(), c.getNewAmount(), c.getReason(),
					c.getChangedBy(), c.getChangedAt());
		}

	}

}
