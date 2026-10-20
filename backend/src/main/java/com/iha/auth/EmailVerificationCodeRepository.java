package com.iha.auth;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface EmailVerificationCodeRepository extends JpaRepository<EmailVerificationCode, UUID> {

	Optional<EmailVerificationCode> findFirstByUserIdAndPurposeAndConsumedAtIsNullOrderByCreatedAtDesc(UUID userId,
			String purpose);

	/** Invalidates earlier codes of the same purpose when a new one is issued. */
	@Modifying
	@Query("update EmailVerificationCode c set c.consumedAt = :now where c.userId = :userId and c.purpose = :purpose and c.consumedAt is null")
	void consumeAllForUser(UUID userId, String purpose, Instant now);

}
