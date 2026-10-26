package com.iha.treatment;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TreatmentPlanRepository extends JpaRepository<TreatmentPlan, UUID> {

	List<TreatmentPlan> findByCaseId(UUID caseId);

	Optional<TreatmentPlan> findByCaseIdAndDoctorId(UUID caseId, UUID doctorId);

	List<TreatmentPlan> findByDoctorId(UUID doctorId);

	List<TreatmentPlan> findByHospitalIdAndStatusNot(UUID hospitalId, String status);

}
