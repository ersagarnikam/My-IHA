package com.iha.specialty;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface SpecialtyRepository extends JpaRepository<Specialty, UUID> {

	List<Specialty> findByActiveTrueOrderBySortOrder();

	boolean existsByNameAndActiveTrue(String name);

}
