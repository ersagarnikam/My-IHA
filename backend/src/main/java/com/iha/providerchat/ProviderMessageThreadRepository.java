package com.iha.providerchat;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ProviderMessageThreadRepository extends JpaRepository<ProviderMessageThread, UUID> {

	Optional<ProviderMessageThread> findByDoctorId(UUID doctorId);

	Optional<ProviderMessageThread> findByHospitalId(UUID hospitalId);

	Optional<ProviderMessageThread> findByLawyerId(UUID lawyerId);

}
