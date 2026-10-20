package com.iha.payment;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
class PaymentGatewayConfig {

	@Bean
	PaymentGateway paymentGateway(PaymentProperties properties) {
		return switch (properties.provider() == null ? FakePaymentGateway.NAME : properties.provider()) {
			case StripePaymentGateway.NAME -> new StripePaymentGateway(properties.stripe());
			case FakePaymentGateway.NAME -> new FakePaymentGateway();
			default -> throw new IllegalStateException("Unknown iha.payments.provider: " + properties.provider());
		};
	}

}
