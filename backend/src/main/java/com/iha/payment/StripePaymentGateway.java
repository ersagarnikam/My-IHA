package com.iha.payment;

import java.util.Map;
import java.util.Set;

import com.iha.common.ApiException;
import com.stripe.StripeClient;
import com.stripe.exception.SignatureVerificationException;
import com.stripe.exception.StripeException;
import com.stripe.model.Event;
import com.stripe.model.PaymentIntent;
import com.stripe.model.StripeObject;
import com.stripe.net.Webhook;
import com.stripe.param.CustomerCreateParams;
import com.stripe.param.CustomerSessionCreateParams;
import com.stripe.param.CustomerUpdateParams;
import com.stripe.param.PaymentIntentCreateParams;
import com.stripe.param.PaymentMethodAttachParams;
import com.stripe.param.PaymentMethodUpdateParams;

import org.springframework.http.HttpStatus;

/** Stripe PaymentIntents, Customers and CustomerSessions (port of the old {@code /api/payments/*} routes). */
class StripePaymentGateway implements PaymentGateway {

	static final String NAME = "stripe";

	/** Intent states that can still be paid, so the intent is reused instead of creating another. */
	private static final Set<String> REUSABLE = Set.of("requires_payment_method", "requires_confirmation",
			"requires_action");

	private final StripeClient stripe;
	private final PaymentProperties.Stripe config;

	StripePaymentGateway(PaymentProperties.Stripe config) {
		if (config == null || config.secretKey() == null || config.secretKey().isBlank()) {
			throw new IllegalStateException("iha.payments.stripe.secret-key is required when the provider is stripe");
		}
		this.config = config;
		this.stripe = new StripeClient(config.secretKey());
	}

	@Override
	public String name() {
		return NAME;
	}

	@Override
	public String publishableKey() {
		return config.publishableKey();
	}

	@Override
	public String ensureCustomer(String existingCustomerId, String email, String name, Map<String, String> metadata) {
		if (existingCustomerId != null) {
			return existingCustomerId;
		}
		return call(() -> stripe.v1()
			.customers()
			.create(CustomerCreateParams.builder().setEmail(email).setName(name).putAllMetadata(metadata).build())
			.getId());
	}

	@Override
	public Intent createOrReuseIntent(String existingIntentId, long amountCents, String customerId,
			String defaultPaymentMethodId, Map<String, String> metadata, String description) {
		return call(() -> {
			if (existingIntentId != null) {
				PaymentIntent existing = stripe.v1().paymentIntents().retrieve(existingIntentId);
				if (REUSABLE.contains(existing.getStatus()) && existing.getAmount() == amountCents) {
					return new Intent(existing.getId(), existing.getClientSecret());
				}
			}
			PaymentIntentCreateParams.Builder params = PaymentIntentCreateParams.builder()
				.setAmount(amountCents)
				.setCurrency("aud")
				.setCustomer(customerId)
				.setDescription(description)
				.putAllMetadata(metadata)
				.setAutomaticPaymentMethods(
						PaymentIntentCreateParams.AutomaticPaymentMethods.builder().setEnabled(true).build());
			if (defaultPaymentMethodId != null) {
				params.setPaymentMethod(defaultPaymentMethodId);
			}
			PaymentIntent created = stripe.v1().paymentIntents().create(params.build());
			return new Intent(created.getId(), created.getClientSecret());
		});
	}

	@Override
	public String customerSessionSecret(String customerId) {
		CustomerSessionCreateParams.Components.PaymentElement.Features features = CustomerSessionCreateParams.Components.PaymentElement.Features
			.builder()
			.setPaymentMethodRedisplay(
					CustomerSessionCreateParams.Components.PaymentElement.Features.PaymentMethodRedisplay.ENABLED)
			.setPaymentMethodSave(
					CustomerSessionCreateParams.Components.PaymentElement.Features.PaymentMethodSave.ENABLED)
			.build();
		return call(() -> stripe.v1()
			.customerSessions()
			.create(CustomerSessionCreateParams.builder()
				.setCustomer(customerId)
				.setComponents(CustomerSessionCreateParams.Components.builder()
					.setPaymentElement(CustomerSessionCreateParams.Components.PaymentElement.builder()
						.setEnabled(true)
						.setFeatures(features)
						.build())
					.build())
				.build())
			.getClientSecret());
	}

	@Override
	public Card attachCard(String customerId, String paymentMethodId) {
		return call(() -> {
			stripe.v1()
				.paymentMethods()
				.attach(paymentMethodId, PaymentMethodAttachParams.builder().setCustomer(customerId).build());
			// Lets the Payment Element show the card again at checkout.
			com.stripe.model.PaymentMethod method = stripe.v1()
				.paymentMethods()
				.update(paymentMethodId, PaymentMethodUpdateParams.builder()
					.setAllowRedisplay(PaymentMethodUpdateParams.AllowRedisplay.ALWAYS)
					.build());
			com.stripe.model.PaymentMethod.Card card = method.getCard();
			if (card == null) {
				throw ApiException.badRequest("not_a_card", "Only cards can be saved.");
			}
			return new Card(method.getId(), card.getBrand(), card.getLast4(), card.getExpMonth().intValue(),
					card.getExpYear().intValue());
		});
	}

	@Override
	public void setDefaultCard(String customerId, String paymentMethodId) {
		call(() -> stripe.v1()
			.customers()
			.update(customerId, CustomerUpdateParams.builder()
				.setInvoiceSettings(CustomerUpdateParams.InvoiceSettings.builder()
					.setDefaultPaymentMethod(paymentMethodId)
					.build())
				.build()));
	}

	@Override
	public void detachCard(String paymentMethodId) {
		call(() -> stripe.v1().paymentMethods().detach(paymentMethodId));
	}

	@Override
	public WebhookEvent parseWebhook(String payload, String signatureHeader) {
		if (config.webhookSecret() == null || config.webhookSecret().isBlank()) {
			throw new IllegalStateException("iha.payments.stripe.webhook-secret is not set");
		}
		Event event;
		try {
			event = Webhook.constructEvent(payload, signatureHeader, config.webhookSecret());
		}
		catch (SignatureVerificationException ex) {
			throw ApiException.badRequest("invalid_signature", "Invalid Stripe signature.");
		}
		StripeObject object = event.getDataObjectDeserializer().getObject().orElse(null);
		if (!(object instanceof PaymentIntent intent)) {
			return new WebhookEvent(event.getType(), null, null);
		}
		return new WebhookEvent(event.getType(), intent.getId(), intent.getLatestCharge());
	}

	private static <T> T call(StripeCall<T> call) {
		try {
			return call.run();
		}
		catch (StripeException ex) {
			throw new ApiException(HttpStatus.BAD_GATEWAY, "payment_provider_error",
					ex.getUserMessage() != null ? ex.getUserMessage() : "The payment provider rejected the request.");
		}
	}

	@FunctionalInterface
	private interface StripeCall<T> {

		T run() throws StripeException;

	}

}
