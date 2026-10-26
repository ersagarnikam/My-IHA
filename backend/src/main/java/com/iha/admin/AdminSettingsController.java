package com.iha.admin;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.iha.auth.CurrentUser;
import com.iha.fees.BusinessSettingsService;
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
	private final BusinessSettingsService business;

	AdminSettingsController(FeeSettingsService fees, BusinessSettingsService business) {
		this.fees = fees;
		this.business = business;
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

	/** MTA's business details for invoices and how GST applies to each kind of charge. */
	@GetMapping("/business")
	public BusinessResponse business() {
		return BusinessResponse.of(business.current());
	}

	@PutMapping("/business")
	public BusinessResponse updateBusiness(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody BusinessRequest request) {
		return BusinessResponse.of(business.update(CurrentUser.from(jwt),
				new BusinessSettingsService.Business(request.legalName(), request.abn(), request.address(), request.email(),
						request.gstRegistered(), request.taxable(), null, null)));
	}

	public record BusinessRequest(@Size(max = 200) String legalName, @Size(max = 20) String abn,
			@Size(max = 300) String address, @Size(max = 200) String email, boolean gstRegistered,
			Map<BusinessSettingsService.Charge, Boolean> taxable) {
	}

	/** {@code charges}: each kind of charge with its label and whether it carries GST. */
	public record BusinessResponse(String legalName, String abn, String address, String email, boolean gstRegistered,
			boolean taxInvoices, List<ChargeResponse> charges, Instant updatedAt, String updatedBy) {

		static BusinessResponse of(BusinessSettingsService.Business b) {
			return new BusinessResponse(b.legalName(), b.abn(), b.address(), b.email(), b.gstRegistered(), b.chargesGst(),
					java.util.Arrays.stream(BusinessSettingsService.Charge.values())
						.map(c -> new ChargeResponse(c, BusinessSettingsService.label(c), Boolean.TRUE.equals(b.taxable().get(c))))
						.toList(),
					b.updatedAt(), b.updatedBy());
		}

	}

	public record ChargeResponse(BusinessSettingsService.Charge charge, String label, boolean taxable) {
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
