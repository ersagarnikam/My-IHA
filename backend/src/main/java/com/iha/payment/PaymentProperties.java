package com.iha.payment;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * @param provider {@code stripe} for real payments, {@code fake} to simulate them
 * locally (the payment page then offers a "simulate payment" button)
 */
@ConfigurationProperties("iha.payments")
public record PaymentProperties(String provider, Stripe stripe) {

	public record Stripe(String secretKey, String publishableKey, String webhookSecret) {
	}

}
