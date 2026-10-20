package com.iha.treatment;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface TreatmentPlanSpecialistRepository extends JpaRepository<TreatmentPlanSpecialist, UUID> {

	List<TreatmentPlanSpecialist> findByTreatmentPlanIdIn(Collection<UUID> planIds);

}
