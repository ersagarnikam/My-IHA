package com.iha.hospital;

import java.util.UUID;

import com.iha.auth.CurrentUser;
import com.iha.providerfee.ProviderBillingResponses;
import com.iha.providerfee.ProviderBillingResponses.BillingResponse;
import com.iha.providerfee.ProviderBillingResponses.CheckoutRequest;
import com.iha.providerfee.ProviderFeeService;
import com.iha.refund.RefundService;

import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The hospital's registration fee, annual renewal, fee history and invoices.
 * Open once MTA has approved the hospital, before the registration fee is paid.
 */
@RestController
@RequestMapping("/api/hospital/billing")
public class HospitalBillingController {

	private final HospitalAccountService accounts;
	private final ProviderFeeService fees;
	private final RefundService refunds;

	HospitalBillingController(HospitalAccountService accounts, ProviderFeeService fees, RefundService refunds) {
		this.accounts = accounts;
		this.fees = fees;
		this.refunds = refunds;
	}

	@GetMapping
	public BillingResponse billing(@AuthenticationPrincipal Jwt jwt) {
		return ProviderBillingResponses.billing(fees.billing(accounts.requireApproved(CurrentUser.from(jwt))), refunds);
	}

	/** {@code feeType}: registration or annual. Returns the intent to complete in the browser. */
	@PostMapping("/checkout")
	public ProviderFeeService.Checkout checkout(@AuthenticationPrincipal Jwt jwt,
			@RequestBody CheckoutRequest request) {
		CurrentUser user = CurrentUser.from(jwt);
		return fees.checkout(user, accounts.requireApproved(user), request.feeType());
	}

	/** Only works with the simulated provider (404 otherwise). */
	@PostMapping("/simulate/{intentId}")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void simulate(@AuthenticationPrincipal Jwt jwt, @PathVariable String intentId) {
		fees.simulate(accounts.requireApproved(CurrentUser.from(jwt)), intentId);
	}

	@GetMapping("/payments/{paymentId}/invoice")
	public ResponseEntity<byte[]> invoice(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID paymentId,
			@RequestParam(defaultValue = "true") boolean download) {
		CurrentUser user = CurrentUser.from(jwt);
		return ProviderBillingResponses.pdf(fees.invoice(user, accounts.requireApproved(user), paymentId), download);
	}

}
