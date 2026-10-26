package com.iha.admin;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.iha.auth.CurrentUser;
import com.iha.common.ApiException;
import com.iha.provider.DoctorRepository;
import com.iha.provider.HospitalRepository;
import com.iha.verification.ProviderVerification;
import com.iha.verification.VerificationService;
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

/** Register checks MTA staff record on doctors (AHPRA) and hospitals (accreditation, licence). */
@RestController
@RequestMapping("/api/admin/verifications/{providerType}/{providerId}")
public class AdminVerificationController {

	private final VerificationService verification;
	private final DoctorRepository doctors;
	private final HospitalRepository hospitals;

	AdminVerificationController(VerificationService verification, DoctorRepository doctors,
			HospitalRepository hospitals) {
		this.verification = verification;
		this.doctors = doctors;
		this.hospitals = hospitals;
	}

	@GetMapping
	public VerificationsResponse get(@PathVariable String providerType, @PathVariable UUID providerId) {
		requireProvider(providerType, providerId);
		return response(providerType, providerId);
	}

	/** {@code outcome}: verified, verified_with_conditions (details required) or failed. */
	@PostMapping
	public VerificationsResponse record(@AuthenticationPrincipal Jwt jwt, @PathVariable String providerType,
			@PathVariable UUID providerId, @Valid @RequestBody CheckRequest r) {
		requireProvider(providerType, providerId);
		verification.record(CurrentUser.from(jwt), providerType, providerId, r.checkType(), r.outcome(),
				r.validUntil(), r.details());
		return response(providerType, providerId);
	}

	private VerificationsResponse response(String providerType, UUID providerId) {
		LocalDate today = LocalDate.now(java.time.ZoneId.of("Australia/Brisbane"));
		List<RequiredCheck> required = verification.current(providerType, providerId)
			.entrySet()
			.stream()
			.map(e -> new RequiredCheck(e.getKey(), VerificationService.REQUIRED.get(providerType).get(e.getKey()),
					e.getValue() != null && e.getValue().passes(today),
					e.getValue() == null ? null : CheckResponse.of(e.getValue())))
			.toList();
		return new VerificationsResponse(required, required.stream().allMatch(RequiredCheck::passing),
				verification.history(providerId).stream().map(CheckResponse::of).toList(),
				ProviderVerification.DOCTOR.equals(providerType) ? VerificationService.AHPRA_REGISTER_URL : null);
	}

	private void requireProvider(String providerType, UUID providerId) {
		boolean exists = switch (providerType) {
			case ProviderVerification.DOCTOR -> doctors.existsById(providerId);
			case ProviderVerification.HOSPITAL -> hospitals.existsById(providerId);
			default -> false;
		};
		if (!exists) {
			throw ApiException.notFound("Provider not found.");
		}
	}

	public record CheckRequest(@NotBlank String checkType, @NotBlank String outcome, LocalDate validUntil,
			@Size(max = 1000) String details) {
	}

	public record CheckResponse(UUID id, String checkType, String outcome, LocalDate validUntil, String details,
			String checkedBy, Instant checkedAt) {

		static CheckResponse of(ProviderVerification v) {
			return new CheckResponse(v.getId(), v.getCheckType(), v.getOutcome(), v.getValidUntil(), v.getDetails(),
					v.getCheckedBy(), v.getCheckedAt());
		}

	}

	public record RequiredCheck(String checkType, String label, boolean passing, CheckResponse current) {
	}

	public record VerificationsResponse(List<RequiredCheck> required, boolean allPassing, List<CheckResponse> history,
			String registerUrl) {
	}

}
