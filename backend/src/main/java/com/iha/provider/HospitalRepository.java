package com.iha.provider;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface HospitalRepository extends JpaRepository<Hospital, UUID> {

	List<Hospital> findByStatusOrderByNameAsc(String status);

}
