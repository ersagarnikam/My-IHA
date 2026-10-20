package com.iha.provider;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface DoctorHospitalAffiliationRepository extends JpaRepository<DoctorHospitalAffiliation, UUID> {

	List<DoctorHospitalAffiliation> findByDoctorId(UUID doctorId);

	boolean existsByDoctorIdAndHospitalId(UUID doctorId, UUID hospitalId);

	@Modifying(flushAutomatically = true, clearAutomatically = false)
	@Query("delete from DoctorHospitalAffiliation a where a.doctorId = :doctorId")
	void deleteByDoctor(UUID doctorId);

}
