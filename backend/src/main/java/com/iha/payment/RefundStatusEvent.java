package com.iha.payment;

/** A refund webhook from the provider; the refund module updates its record. */
public record RefundStatusEvent(String gatewayRefundId, String status) {
}
