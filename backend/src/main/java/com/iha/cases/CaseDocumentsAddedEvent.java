package com.iha.cases;

import java.util.Set;
import java.util.UUID;

/** A patient added documents of these types to a case (the doctor module marks its document requests received). */
public record CaseDocumentsAddedEvent(UUID caseId, Set<String> documentTypes) {
}
