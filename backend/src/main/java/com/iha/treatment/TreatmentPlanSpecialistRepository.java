package com.iha.treatment;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface TreatmentPlanSpecialistRepository extends JpaRepository<TreatmentPlanSpecialist, UUID> {

	List<TreatmentPlanSpecialist> findByTreatmentPlanIdIn(Collection<UUID> planIds);

	List<TreatmentPlanSpecialist> findByTreatmentPlanIdOrderByCreatedAtAsc(UUID planId);

	@Modifying(flushAutomatically = true)
	@Query("delete from TreatmentPlanSpecialist s where s.treatmentPlanId = :planId")
	void deleteByPlan(UUID planId);

}
