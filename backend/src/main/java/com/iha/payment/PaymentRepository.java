package com.iha.payment;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

public interface PaymentRepository extends JpaRepository<Payment, UUID> {

	/**
	 * Row-locked so two concurrent "pay" clicks can't both create a payment
	 * intent (replaces the old intent-reuse/loser-cancellation dance).
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<Payment> findFirstByCaseIdAndPaymentTypeAndStatus(UUID caseId, String paymentType, String status);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<Payment> findFirstByConsultationRequestIdAndStatus(UUID consultationRequestId, String status);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<Payment> findByPaymentIntentId(String paymentIntentId);

	boolean existsByCaseIdAndPaymentTypeAndStatus(UUID caseId, String paymentType, String status);

	boolean existsByConsultationRequestIdAndStatus(UUID consultationRequestId, String status);

	List<Payment> findByPatientIdOrderByCreatedAtDesc(UUID patientId);

	List<Payment> findByCaseIdInOrderByCreatedAtDesc(Collection<UUID> caseIds);

	Optional<Payment> findByIdAndPatientId(UUID id, UUID patientId);

}
