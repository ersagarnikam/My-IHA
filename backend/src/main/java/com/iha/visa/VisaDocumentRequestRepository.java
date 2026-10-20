package com.iha.visa;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface VisaDocumentRequestRepository extends JpaRepository<VisaDocumentRequest, UUID> {

	List<VisaDocumentRequest> findByCaseIdOrderByCreatedAtAsc(UUID caseId);

}
