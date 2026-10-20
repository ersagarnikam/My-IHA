package com.iha.payment;

import java.util.Map;
import java.util.UUID;

import com.iha.common.ApiException;

/**
 * Simulated provider for local development: intents are opaque ids that the
 * patient completes with the "simulate payment" button
 * ({@code POST /api/patient/payments/simulate/{intentId}}), which runs exactly
 * the same completion logic as a real webhook. Saved cards are unavailable.
 */
class FakePaymentGateway implements PaymentGateway {

	static final String NAME = "fake";

	@Override
	public String name() {
		return NAME;
	}

	@Override
	public String publishableKey() {
		return null;
	}

	@Override
	public String ensureCustomer(String existingCustomerId, String email, String name, Map<String, String> metadata) {
		return existingCustomerId != null ? existingCustomerId : "cus_fake_" + UUID.randomUUID();
	}

	@Override
	public Intent createOrReuseIntent(String existingIntentId, long amountCents, String customerId,
			String defaultPaymentMethodId, Map<String, String> metadata, String description) {
		String id = existingIntentId != null ? existingIntentId : "pi_fake_" + UUID.randomUUID();
		return new Intent(id, id + "_secret");
	}

	@Override
	public String customerSessionSecret(String customerId) {
		return null;
	}

	@Override
	public Card attachCard(String customerId, String paymentMethodId) {
		throw notSupported();
	}

	@Override
	public void setDefaultCard(String customerId, String paymentMethodId) {
		throw notSupported();
	}

	@Override
	public void detachCard(String paymentMethodId) {
		throw notSupported();
	}

	@Override
	public WebhookEvent parseWebhook(String payload, String signatureHeader) {
		throw ApiException.badRequest("webhook_not_supported", "The simulated payment provider has no webhooks.");
	}

	private static ApiException notSupported() {
		return ApiException.conflict("payments_not_configured",
				"Saved cards need a real payment provider (set iha.payments.provider=stripe).");
	}

}
