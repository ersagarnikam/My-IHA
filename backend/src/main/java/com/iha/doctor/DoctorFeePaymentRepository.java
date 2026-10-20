package com.iha.doctor;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import jakarta.persistence.LockModeType;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Query;

public interface DoctorFeePaymentRepository extends JpaRepository<DoctorFeePayment, UUID> {

	List<DoctorFeePayment> findByDoctorIdOrderByCreatedAtDesc(UUID doctorId);

	Optional<DoctorFeePayment> findByIdAndDoctorId(UUID id, UUID doctorId);

	Optional<DoctorFeePayment> findByPaymentIntentId(String paymentIntentId);

	/** Locked so two checkouts for the same fee can't both attach an intent. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	@Query("select p from DoctorFeePayment p where p.doctorId = :doctorId and p.feeType = :feeType "
			+ "and p.status = 'pending' and (:billingPeriod is null or p.billingPeriod = :billingPeriod) "
			+ "order by p.createdAt desc limit 1")
	Optional<DoctorFeePayment> lockPending(UUID doctorId, String feeType, String billingPeriod);

}
