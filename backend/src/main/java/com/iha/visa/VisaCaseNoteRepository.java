package com.iha.visa;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface VisaCaseNoteRepository extends JpaRepository<VisaCaseNote, UUID> {

	List<VisaCaseNote> findByCaseIdAndLawyerIdOrderByCreatedAtDesc(UUID caseId, UUID lawyerId);

}
