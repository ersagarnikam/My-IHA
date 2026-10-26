package com.iha.provider;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface LawyerRepository extends JpaRepository<Lawyer, UUID> {

	Optional<Lawyer> findByUserId(UUID userId);

}
