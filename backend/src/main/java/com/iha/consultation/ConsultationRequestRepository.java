package com.iha.consultation;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ConsultationRequestRepository extends JpaRepository<ConsultationRequest, UUID> {

	List<ConsultationRequest> findByCaseIdOrderByRequestedAtAsc(UUID caseId);

	List<ConsultationRequest> findByPatientIdOrderByRequestedAtAsc(UUID patientId);

	Optional<ConsultationRequest> findByIdAndPatientId(UUID id, UUID patientId);

	boolean existsByTreatmentOptionId(UUID treatmentOptionId);

	List<ConsultationRequest> findByTreatmentOptionIdInOrderByRequestedAtDesc(Collection<UUID> treatmentOptionIds);

}
