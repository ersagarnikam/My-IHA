package com.iha.providerfee;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.iha.refund.PaymentRefund;
import com.iha.refund.RefundService;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;

/** Response shapes shared by the hospital and lawyer billing endpoints. */
public final class ProviderBillingResponses {

	private ProviderBillingResponses() {
	}

	public static BillingResponse billing(ProviderFeeService.Billing b, RefundService refunds) {
		Map<UUID, List<PaymentRefund>> refunded = refunds
			.refundsByPayment(b.payments().stream().map(ProviderFeePayment::getId).toList());
		return new BillingResponse(b.membership(), b.provider(), b.publishableKey(),
				b.payments().stream()
					.map(p -> FeePaymentResponse.of(p, refunded.getOrDefault(p.getId(), List.of()).stream()
						.map(PaymentRefund::getRefundedAud)
						.reduce(BigDecimal.ZERO, BigDecimal::add)))
					.toList());
	}

	public static ResponseEntity<byte[]> pdf(ProviderFeeService.Invoice invoice, boolean download) {
		ContentDisposition disposition = (download ? ContentDisposition.attachment() : ContentDisposition.inline())
			.filename(invoice.fileName())
			.build();
		return ResponseEntity.ok()
			.contentType(MediaType.APPLICATION_PDF)
			.header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
			.header(HttpHeaders.CACHE_CONTROL, "private, no-store")
			.body(invoice.content());
	}

	public record CheckoutRequest(String feeType) {
	}

	public record BillingResponse(ProviderFeeService.Membership membership, String provider, String publishableKey,
			List<FeePaymentResponse> payments) {
	}

	/** {@code refundedAud}: refunded to the card in total (after card processing fees). */
	public record FeePaymentResponse(UUID id, String feeType, BigDecimal amountAud, String billingPeriod,
			String status, String gatewayReference, Instant paidAt, Instant createdAt, BigDecimal refundedAud) {

		static FeePaymentResponse of(ProviderFeePayment p, BigDecimal refundedAud) {
			return new FeePaymentResponse(p.getId(), p.getFeeType(), p.getAmountAud(), p.getBillingPeriod(),
					p.getStatus(), p.getGatewayReference(), p.getPaidAt(), p.getCreatedAt(), refundedAud);
		}

	}

}
