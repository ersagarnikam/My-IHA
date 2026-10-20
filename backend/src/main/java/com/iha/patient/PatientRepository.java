package com.iha.patient;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface PatientRepository extends JpaRepository<Patient, UUID> {

	Optional<Patient> findByUserId(UUID userId);

	List<Patient> findByDeletedTrueAndScheduledDeleteAtBefore(Instant cutoff);

}
