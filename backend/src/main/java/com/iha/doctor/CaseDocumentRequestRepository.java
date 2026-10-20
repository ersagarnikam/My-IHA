package com.iha.doctor;

import java.util.Collection;
import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface CaseDocumentRequestRepository extends JpaRepository<CaseDocumentRequest, UUID> {

	List<CaseDocumentRequest> findByCaseIdOrderByRequestedAtDesc(UUID caseId);

	List<CaseDocumentRequest> findByCaseIdAndStatusAndDocumentTypeIn(UUID caseId, String status,
			Collection<String> documentTypes);

	boolean existsByCaseIdAndDocumentTypeAndStatus(UUID caseId, String documentType, String status);

}
