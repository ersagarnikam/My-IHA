package com.iha.treatment;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TreatmentOptionRepository extends JpaRepository<TreatmentOption, UUID> {

	List<TreatmentOption> findByCaseIdAndPublishedAtIsNotNullOrderByCreatedAtAsc(UUID caseId);

	List<TreatmentOption> findByCaseIdInAndPublishedAtIsNotNullOrderByCreatedAtAsc(Collection<UUID> caseIds);

	Optional<TreatmentOption> findByIdAndPublishedAtIsNotNull(UUID id);

	Optional<TreatmentOption> findFirstByCaseIdAndSelectedTrue(UUID caseId);

}
