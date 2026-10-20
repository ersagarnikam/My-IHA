package com.iha.cases;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface CaseDocumentRepository extends JpaRepository<CaseDocument, UUID> {

	List<CaseDocument> findByCaseIdOrderByUploadedAtAsc(UUID caseId);

	List<CaseDocument> findByPatientIdOrderByUploadedAtDesc(UUID patientId);

	Optional<CaseDocument> findByIdAndCaseId(UUID id, UUID caseId);

	Optional<CaseDocument> findByIdAndPatientId(UUID id, UUID patientId);

	long countByCaseId(UUID caseId);

	long countByCaseIdAndDocumentType(UUID caseId, String documentType);

	@Query("select d.caseId as caseId, count(d) as total from CaseDocument d where d.caseId in :caseIds group by d.caseId")
	List<CaseDocumentCount> countByCaseIds(Collection<UUID> caseIds);

	interface CaseDocumentCount {

		UUID getCaseId();

		long getTotal();

	}

}
