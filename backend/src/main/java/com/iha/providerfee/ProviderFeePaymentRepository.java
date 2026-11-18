package com.iha.providerfee;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface ProviderFeePaymentRepository extends JpaRepository<ProviderFeePayment, UUID> {

	List<ProviderFeePayment> findByProviderTypeAndProviderIdOrderByCreatedAtDesc(String providerType, UUID providerId);

	Optional<ProviderFeePayment> findByIdAndProviderTypeAndProviderId(UUID id, String providerType, UUID providerId);

	Optional<ProviderFeePayment> findByPaymentIntentId(String paymentIntentId);

	Optional<ProviderFeePayment> findByIdAndProviderType(UUID id, String providerType);

	/** Locked so two checkouts for the same fee can't both attach an intent. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select p from ProviderFeePayment p where p.providerType = :providerType and p.providerId = :providerId "
			+ "and p.feeType = :feeType and p.status = 'pending' "
			+ "and (:billingPeriod is null or p.billingPeriod = :billingPeriod) order by p.createdAt desc limit 1")
	Optional<ProviderFeePayment> lockPending(String providerType, UUID providerId, String feeType,
			String billingPeriod);

}
