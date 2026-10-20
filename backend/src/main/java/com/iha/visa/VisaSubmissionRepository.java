package com.iha.visa;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface VisaSubmissionRepository extends JpaRepository<VisaSubmission, UUID> {

	Optional<VisaSubmission> findByCaseId(UUID caseId);

	Optional<VisaSubmission> findByIdAndPatientId(UUID id, UUID patientId);

	List<VisaSubmission> findByPatientIdOrderByCreatedAtDesc(UUID patientId);

	List<VisaSubmission> findByCaseIdIn(Collection<UUID> caseIds);

}
