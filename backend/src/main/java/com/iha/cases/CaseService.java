package com.iha.cases;

import java.io.ByteArrayInputStream;
import java.time.Year;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.common.ApiException;
import com.iha.notification.NotificationService;
import com.iha.patient.Patient;
import com.iha.patient.PatientService;
import com.iha.specialty.Specialty;
import com.iha.specialty.SpecialtyRepository;
import com.iha.storage.FileType;
import com.iha.storage.StorageService;
import com.iha.storage.Uploads;

import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Patient-side case operations (ported from {@code apps/patient/lib/actions/cases.ts}).
 * Every query is scoped to the caller's patient row, which is what the old
 * {@code cases} RLS policies enforced.
 */
@Service
public class CaseService {

	static final int MAX_FILES_PER_CASE = 10;
	public static final Set<String> MEDICAL_DOCUMENT_TYPES = Set.of("lab_report", "mri_ct", "xray", "prescription",
			"medical_history", "other");

	/** Medical documents can be added until doctors have produced a treatment plan. */
	public static final Set<CaseStatus> MEDICAL_UPLOAD_STATUSES = EnumSet.of(CaseStatus.CASE_SUBMITTED,
			CaseStatus.UNDER_REVIEW, CaseStatus.DOCTOR_ASSIGNED, CaseStatus.EVALUATION);

	private final CaseRepository cases;
	private final CaseDocumentRepository documents;
	private final SpecialtyRepository specialties;
	private final PatientService patientService;
	private final NotificationService notifications;
	private final StorageService storage;
	private final AuditService audit;

	public CaseService(CaseRepository cases, CaseDocumentRepository documents, SpecialtyRepository specialties,
			PatientService patientService, NotificationService notifications, StorageService storage,
			AuditService audit) {
		this.cases = cases;
		this.documents = documents;
		this.specialties = specialties;
		this.patientService = patientService;
		this.notifications = notifications;
		this.storage = storage;
		this.audit = audit;
	}

	@Transactional
	public MedicalCase submit(CurrentUser user, String specialty, String specialtyOther, String description,
			List<String> documentTypes, List<MultipartFile> files) {
		Patient patient = patientService.requireCurrent(user);

		String other = specialtyOther == null || specialtyOther.isBlank() ? null : specialtyOther.trim();
		if (!specialties.existsByNameAndActiveTrue(specialty)) {
			throw ApiException.badRequest("invalid_specialty", "Please select a medical specialty.");
		}
		if (Specialty.OTHER.equals(specialty) && (other == null || other.length() < 2)) {
			throw ApiException.badRequest("specialty_other_required",
					"Please describe your specialty (at least 2 characters).");
		}
		List<TypedUpload> uploads = validateFiles(documentTypes, files, 0);
		if (uploads.isEmpty()) {
			throw ApiException.badRequest("documents_required", "Please upload at least one document.");
		}

		String referenceNumber = "IHA-%d-%05d".formatted(Year.now().getValue(), cases.nextReferenceSequence());
		MedicalCase medicalCase = cases.save(
				new MedicalCase(patient.getId(), referenceNumber, specialty, other, description.trim()));

		storeDocuments(patient, medicalCase, uploads);

		notifications.notify(user.id(), "case_submitted", "Case submitted",
				"Your case %s has been received by MTA.".formatted(referenceNumber), medicalCase.getId());
		audit.record(user.id(), user.email(), "patient", "case.submitted", "case", medicalCase.getId(),
				Map.of("reference_number", referenceNumber, "document_count", uploads.size()));
		return medicalCase;
	}

	@Transactional
	public List<CaseDocument> addDocuments(CurrentUser user, UUID caseId, List<String> documentTypes,
			List<MultipartFile> files) {
		Patient patient = patientService.requireCurrent(user);
		MedicalCase medicalCase = requireOwned(patient, caseId);
		if (!MEDICAL_UPLOAD_STATUSES.contains(medicalCase.getStatus())) {
			throw ApiException.conflict("case_documents_locked",
					"Documents can no longer be added to this case.");
		}
		List<TypedUpload> uploads = validateFiles(documentTypes, files, documents.countByCaseId(caseId));
		if (uploads.isEmpty()) {
			throw ApiException.badRequest("documents_required", "Please choose at least one document.");
		}
		List<CaseDocument> saved = storeDocuments(patient, medicalCase, uploads);
		audit.record(user.id(), user.email(), "patient", "case.documents_added", "case", caseId,
				Map.of("document_count", saved.size()));
		return saved;
	}

	/** Documents page upload: optionally attached to a case that still accepts documents. */
	@Transactional
	public CaseDocument uploadStandalone(CurrentUser user, String documentType, MultipartFile file, UUID caseId) {
		if (caseId != null) {
			return addDocuments(user, caseId, List.of(documentType), List.of(file)).get(0);
		}
		Patient patient = patientService.requireCurrent(user);
		if (!MEDICAL_DOCUMENT_TYPES.contains(documentType)) {
			throw ApiException.badRequest("invalid_document_type", "Unknown document type: " + documentType);
		}
		Uploads.ValidatedUpload upload = Uploads.validate(file, Uploads.DOCUMENT_MAX_BYTES, FileType.DOCUMENTS);
		UUID documentId = UUID.randomUUID();
		String path = "case-documents/%s/standalone/%s%s".formatted(patient.getId(), documentId,
				upload.type().extension());
		storage.store(path, new ByteArrayInputStream(upload.content()));
		CaseDocument saved = documents.save(new CaseDocument(documentId, patient.getId(), null, documentType,
				documentType + "-" + documentId.toString().substring(0, 8) + upload.type().extension(), path,
				upload.content().length, upload.type().mimeType()));
		audit.record(user.id(), user.email(), "patient", "documents.uploaded", "case_document", documentId,
				Map.of("document_type", documentType));
		return saved;
	}

	/** Attaches a standalone document to a case, renaming it to the case's logical scheme. */
	@Transactional
	public CaseDocument linkToCase(CurrentUser user, UUID documentId, UUID caseId) {
		Patient patient = patientService.requireCurrent(user);
		CaseDocument document = documents.findByIdAndPatientId(documentId, patient.getId())
			.orElseThrow(() -> ApiException.notFound("Document not found."));
		MedicalCase medicalCase = requireOwned(patient, caseId);
		if (!MEDICAL_UPLOAD_STATUSES.contains(medicalCase.getStatus())) {
			throw ApiException.conflict("case_documents_locked", "Documents can no longer be added to this case.");
		}
		if (documents.countByCaseId(caseId) >= MAX_FILES_PER_CASE) {
			throw ApiException.badRequest("too_many_documents",
					"A case can have up to %d documents.".formatted(MAX_FILES_PER_CASE));
		}
		document.linkToCase(caseId, logicalFileName(medicalCase, document.getDocumentType(),
				FileType.fromMimeType(document.getMimeType())));
		audit.record(user.id(), user.email(), "patient", "documents.linked", "case_document", documentId,
				Map.of("case_id", caseId.toString()));
		return document;
	}

	@Transactional(readOnly = true)
	public List<CaseDocument> allDocumentsForPatient(CurrentUser user) {
		return documents.findByPatientIdOrderByUploadedAtDesc(patientService.requireCurrent(user).getId());
	}

	@Transactional
	public MedicalCase updateTravelAssistance(CurrentUser user, UUID caseId, boolean travel, boolean stay,
			boolean transportation) {
		MedicalCase medicalCase = requireOwned(patientService.requireCurrent(user), caseId);
		if (medicalCase.getStatus() != CaseStatus.TRAVEL_READY) {
			throw ApiException.conflict("case_not_travel_ready",
					"Travel assistance can be requested once your visa is approved.");
		}
		medicalCase.updateTravelAssistance(travel, stay, transportation);
		audit.record(user.id(), user.email(), "patient", "case.travel_assistance_updated", "case", caseId,
				Map.of("travel", travel, "stay", stay, "transportation", transportation));
		return medicalCase;
	}

	@Transactional(readOnly = true)
	public List<CaseSummary> listForPatient(CurrentUser user) {
		Patient patient = patientService.requireCurrent(user);
		List<MedicalCase> patientCases = cases.findByPatientIdOrderByCreatedAtDesc(patient.getId());
		Map<UUID, Long> counts = documentCounts(patientCases);
		return patientCases.stream()
			.map(c -> new CaseSummary(c, counts.getOrDefault(c.getId(), 0L)))
			.toList();
	}

	@Transactional(readOnly = true)
	public MedicalCase getForPatient(CurrentUser user, UUID caseId) {
		return requireOwned(patientService.requireCurrent(user), caseId);
	}

	/** Ownership check other modules (treatments, visa, payments) build on. */
	public MedicalCase requireOwned(Patient patient, UUID caseId) {
		return cases.findByIdAndPatientId(caseId, patient.getId())
			.orElseThrow(() -> ApiException.notFound("Case not found."));
	}

	@Transactional(readOnly = true)
	public List<CaseDocument> documentsForPatient(CurrentUser user, UUID caseId) {
		return documents.findByCaseIdOrderByUploadedAtAsc(getForPatient(user, caseId).getId());
	}

	@Transactional(readOnly = true)
	public StoredDocument openDocumentForPatient(CurrentUser user, UUID documentId) {
		Patient patient = patientService.requireCurrent(user);
		CaseDocument document = documents.findByIdAndPatientId(documentId, patient.getId())
			.orElseThrow(() -> ApiException.notFound("Document not found."));
		return new StoredDocument(document, storage.load(document.getFilePath()));
	}

	public Map<UUID, Long> documentCounts(List<MedicalCase> patientCases) {
		return patientCases.isEmpty() ? Map.of()
				: documents.countByCaseIds(patientCases.stream().map(MedicalCase::getId).toList())
					.stream()
					.collect(Collectors.toMap(CaseDocumentRepository.CaseDocumentCount::getCaseId,
							CaseDocumentRepository.CaseDocumentCount::getTotal));
	}

	/** Same logical naming as the old app: IHA-2026-00001-lab_report-2.pdf */
	String logicalFileName(MedicalCase medicalCase, String documentType, FileType fileType) {
		long n = documents.countByCaseIdAndDocumentType(medicalCase.getId(), documentType) + 1;
		return medicalCase.getReferenceNumber() + "-" + documentType + (n > 1 ? "-" + n : "") + fileType.extension();
	}

	private List<TypedUpload> validateFiles(List<String> documentTypes, List<MultipartFile> files, long existing) {
		List<MultipartFile> nonEmpty = files == null ? List.of()
				: files.stream().filter(f -> f != null && !f.isEmpty()).toList();
		if (existing + nonEmpty.size() > MAX_FILES_PER_CASE) {
			throw ApiException.badRequest("too_many_documents",
					"A case can have up to %d documents.".formatted(MAX_FILES_PER_CASE));
		}
		if (documentTypes == null || documentTypes.size() != nonEmpty.size()) {
			throw ApiException.badRequest("document_types_mismatch", "Each document needs a document type.");
		}
		List<TypedUpload> validated = new ArrayList<>();
		for (int i = 0; i < nonEmpty.size(); i++) {
			String type = documentTypes.get(i);
			if (!MEDICAL_DOCUMENT_TYPES.contains(type)) {
				throw ApiException.badRequest("invalid_document_type", "Unknown document type: " + type);
			}
			validated.add(new TypedUpload(type,
					Uploads.validate(nonEmpty.get(i), Uploads.DOCUMENT_MAX_BYTES, FileType.DOCUMENTS)));
		}
		return validated;
	}

	/**
	 * Writes the files and their rows. Files written before a failure are
	 * removed so a rolled-back request leaves nothing behind in storage.
	 */
	private List<CaseDocument> storeDocuments(Patient patient, MedicalCase medicalCase, List<TypedUpload> uploads) {
		List<String> written = new ArrayList<>();
		List<CaseDocument> saved = new ArrayList<>();
		try {
			for (TypedUpload typed : uploads) {
				FileType fileType = typed.upload().type();
				UUID documentId = UUID.randomUUID();
				String path = "case-documents/%s/%s/%s%s".formatted(patient.getId(), medicalCase.getId(), documentId,
						fileType.extension());
				storage.store(path, new ByteArrayInputStream(typed.upload().content()));
				written.add(path);
				saved.add(documents.saveAndFlush(new CaseDocument(documentId, patient.getId(), medicalCase.getId(),
						typed.documentType(), logicalFileName(medicalCase, typed.documentType(), fileType), path,
						typed.upload().content().length, fileType.mimeType())));
			}
			return saved;
		}
		catch (RuntimeException ex) {
			written.forEach(this::deleteQuietly);
			throw ex;
		}
	}

	private void deleteQuietly(String path) {
		try {
			storage.delete(path);
		}
		catch (RuntimeException ignored) {
			// Best effort; an orphaned file is harmless.
		}
	}

	private record TypedUpload(String documentType, Uploads.ValidatedUpload upload) {
	}

	public record CaseSummary(MedicalCase medicalCase, long documentCount) {
	}

	public record StoredDocument(CaseDocument document, Resource content) {
	}

}
