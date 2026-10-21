package com.iha.refund;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PaymentRefundRepository extends JpaRepository<PaymentRefund, UUID> {

	List<PaymentRefund> findByPaymentIdOrderByCreatedAtAsc(UUID paymentId);

	List<PaymentRefund> findByPaymentIdIn(Collection<UUID> paymentIds);

	Optional<PaymentRefund> findByGatewayRefundId(String gatewayRefundId);

}
