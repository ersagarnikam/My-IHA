package com.iha.fees;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PlatformFeeSettingRepository extends JpaRepository<PlatformFeeSetting, UUID> {

	Optional<PlatformFeeSetting> findByFeeKey(String feeKey);

}
