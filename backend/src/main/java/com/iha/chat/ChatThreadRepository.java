package com.iha.chat;

import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

interface ChatThreadRepository extends JpaRepository<ChatThread, UUID> {

	Optional<ChatThread> findByPatientId(UUID patientId);

}
