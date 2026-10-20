package com.iha.payment;

import java.util.Map;

/** The card-payment provider (Stripe in production; a fake for local development). */
public interface PaymentGateway {

	/** Stored in {@code payments.gateway} and sent to the browser to pick the payment UI. */
	String name();

	/** Browser-side key, or null when the provider has none. */
	String publishableKey();

	/** Returns {@code existingCustomerId} or creates a customer. */
	String ensureCustomer(String existingCustomerId, String email, String name, Map<String, String> metadata);

	/** Reuses {@code existingIntentId} while it is still payable, otherwise creates a new intent. */
	Intent createOrReuseIntent(String existingIntentId, long amountCents, String customerId,
			String defaultPaymentMethodId, Map<String, String> metadata, String description);

	/** Lets the payment form list the customer's saved cards; null when unsupported. */
	String customerSessionSecret(String customerId);

	Card attachCard(String customerId, String paymentMethodId);

	void setDefaultCard(String customerId, String paymentMethodId);

	void detachCard(String paymentMethodId);

	/** Verifies the signature and extracts what the API needs; throws on a bad signature. */
	WebhookEvent parseWebhook(String payload, String signatureHeader);

	record Intent(String id, String clientSecret) {
	}

	record Card(String paymentMethodId, String brand, String last4, int expMonth, int expYear) {
	}

	/** @param chargeReference the provider's charge id (shown as the payment reference) */
	record WebhookEvent(String type, String intentId, String chargeReference) {

		public static final String SUCCEEDED = "payment_intent.succeeded";
		public static final String FAILED = "payment_intent.payment_failed";

	}

}
