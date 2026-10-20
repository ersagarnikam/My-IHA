package com.iha.cases;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface CaseRepository extends JpaRepository<MedicalCase, UUID> {

	List<MedicalCase> findByPatientIdOrderByCreatedAtDesc(UUID patientId);

	Optional<MedicalCase> findByIdAndPatientId(UUID id, UUID patientId);

	/** nextval() works on both PostgreSQL and H2 (PostgreSQL mode). */
	@Query(value = "select nextval('cases_reference_seq')", nativeQuery = true)
	long nextReferenceSequence();

}
