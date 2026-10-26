package com.iha.visa;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface VisaDocumentRepository extends JpaRepository<VisaDocument, UUID> {

	List<VisaDocument> findByCaseIdOrderByUploadedAtAsc(UUID caseId);

	List<VisaDocument> findByCaseIdInAndSourceAndSentToPatientAtIsNotNull(Collection<UUID> caseIds, String source);

	List<VisaDocument> findByPatientIdOrderByUploadedAtDesc(UUID patientId);

	Optional<VisaDocument> findByIdAndPatientId(UUID id, UUID patientId);

	List<VisaDocument> findByCaseIdAndSourceAndVisaSubmissionIdIsNull(UUID caseId, String source);

	List<VisaDocument> findByCaseIdInAndSource(Collection<UUID> caseIds, String source);

	Optional<VisaDocument> findFirstByCaseIdAndSourceAndCategory(UUID caseId, String source, String category);

}
