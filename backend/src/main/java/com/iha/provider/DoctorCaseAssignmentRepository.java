package com.iha.provider;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface DoctorCaseAssignmentRepository extends JpaRepository<DoctorCaseAssignment, UUID> {

	List<DoctorCaseAssignment> findByCaseId(UUID caseId);

	Optional<DoctorCaseAssignment> findByCaseIdAndDoctorId(UUID caseId, UUID doctorId);

	Optional<DoctorCaseAssignment> findByIdAndDoctorId(UUID id, UUID doctorId);

	List<DoctorCaseAssignment> findByDoctorIdOrderByInvitedAtDesc(UUID doctorId);

}
