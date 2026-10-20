package com.iha.provider;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DoctorRepository extends JpaRepository<Doctor, UUID> {

	Optional<Doctor> findByUserId(UUID userId);

}
