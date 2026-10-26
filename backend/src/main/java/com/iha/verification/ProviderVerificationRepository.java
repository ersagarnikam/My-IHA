package com.iha.verification;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProviderVerificationRepository extends JpaRepository<ProviderVerification, UUID> {

	List<ProviderVerification> findByProviderIdOrderByCheckedAtDesc(UUID providerId);

}
