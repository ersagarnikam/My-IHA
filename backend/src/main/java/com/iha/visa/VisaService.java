package com.iha.visa;

import java.awt.image.BufferedImage;
import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.stream.Collectors;

import javax.imageio.ImageIO;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.cases.CaseRepository;
import com.iha.cases.CaseService;
import com.iha.cases.CaseStatus;
import com.iha.cases.CaseStatusService;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.notification.NotificationService;
import com.iha.patient.Patient;
import com.iha.patient.PatientService;
import com.iha.provider.Lawyer;
import com.iha.provider.LawyerRepository;
import com.iha.storage.FileType;
import com.iha.storage.StorageService;
import com.iha.storage.Uploads;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * The patient's side of the visa process (ported from {@code lib/actions/visa.ts}
 * and the {@code submit_visa_application}, {@code add_visa_documents_for_case}
 * and {@code link_visa_document_to_case} RPCs).
 */
@Service
public class VisaService {

	/** Case statuses in which visa documents can be added to the case (old RPC rule). */
	static final Set<CaseStatus> DOCUMENT_STATUSES = EnumSet.of(CaseStatus.PAYMENT_CONFIRMED,
			CaseStatus.VISA_DOCUMENTS_SUBMITTED);

	/** Case statuses in which the visa page is reachable at all. */
	public static final Set<CaseStatus> VISA_PAGE_STATUSES = EnumSet.of(CaseStatus.PAYMENT_CONFIRMED,
			CaseStatus.VISA_DOCUMENTS_SUBMITTED, CaseStatus.VISA_PROCESSING, CaseStatus.TRAVEL_READY,
			CaseStatus.VISA_REJECTED, CaseStatus.COMPLETED);

	private final VisaSubmissionRepository submissions;
	private final VisaDocumentRepository documents;
	private final VisaDocumentRequestRepository requests;
	private final PatientService patientService;
	private final CaseService caseService;
	private final CaseRepository cases;
	private final CaseStatusService caseStatus;
	private final LawyerRepository lawyers;
	private final NotificationService notifications;
	private final StorageService storage;
	private final AuditService audit;
	private final JsonMapper jsonMapper;

	VisaService(VisaSubmissionRepository submissions, VisaDocumentRepository documents,
			VisaDocumentRequestRepository requests, PatientService patientService, CaseService caseService,
			CaseRepository cases, CaseStatusService caseStatus, LawyerRepository lawyers,
			NotificationService notifications, StorageService storage, AuditService audit, JsonMapper jsonMapper) {
		this.submissions = submissions;
		this.documents = documents;
		this.requests = requests;
		this.patientService = patientService;
		this.caseService = caseService;
		this.cases = cases;
		this.caseStatus = caseStatus;
		this.lawyers = lawyers;
		this.notifications = notifications;
		this.storage = storage;
		this.audit = audit;
		this.jsonMapper = jsonMapper;
	}

	/** Everything the case page and the visa wizard need about one case. */
	@Transactional(readOnly = true)
	public CaseVisa forCase(CurrentUser user, UUID caseId) {
		MedicalCase medicalCase = caseService.requireOwned(patientService.requireCurrent(user), caseId);
		List<VisaDocument> caseDocs = visible(documents.findByCaseIdOrderByUploadedAtAsc(caseId));
		VisaSubmission submission = submissions.findByCaseId(caseId).orElse(null);
		return new CaseVisa(medicalCase, submission, caseDocs, lettersReady(caseDocs),
				submission == null ? List.of() : openRequests(caseId, caseDocs));
	}

	@Transactional
	public VisaDocument uploadForCase(CurrentUser user, UUID caseId, String category, MultipartFile file) {
		Patient patient = patientService.requireCurrent(user);
		MedicalCase medicalCase = caseService.requireOwned(patient, caseId);
		if (!DOCUMENT_STATUSES.contains(medicalCase.getStatus())) {
			throw ApiException.conflict("case_not_eligible_for_visa_documents",
					"Visa documents can be added once the treatment is paid.");
		}
		VisaSubmission submission = submissions.findByCaseId(caseId)
			.orElseGet(() -> submissions.save(new VisaSubmission(caseId, patient.getId())));
		if (VisaSubmission.UPLOAD_LOCKED.contains(submission.getStatus())) {
			throw ApiException.conflict("visa_documents_locked",
					"Your application has been lodged; documents can no longer be added.");
		}
		VisaDocument saved = store(patient, medicalCase, submission, category, file);
		notifyLawyer(submission, medicalCase, "%s was uploaded for case %s."
			.formatted(categoryLabel(category), medicalCase.getReferenceNumber()));
		return saved;
	}

	/** Old {@code addVisaDocument} from the visa detail page. */
	@Transactional
	public VisaDocument uploadForSubmission(CurrentUser user, UUID submissionId, String category, MultipartFile file) {
		Patient patient = patientService.requireCurrent(user);
		VisaSubmission submission = requireSubmission(patient, submissionId);
		return uploadForCase(user, submission.getCaseId(), category, file);
	}

	/** A visa document kept on file without a case yet (documents page). */
	@Transactional
	public VisaDocument uploadUnlinked(CurrentUser user, String category, MultipartFile file) {
		return store(patientService.requireCurrent(user), null, null, category, file);
	}

	@Transactional
	public VisaDocument linkToCase(CurrentUser user, UUID documentId, UUID caseId) {
		Patient patient = patientService.requireCurrent(user);
		VisaDocument document = documents.findByIdAndPatientId(documentId, patient.getId())
			.filter(d -> VisaDocument.PATIENT_UPLOAD.equals(d.getSource()))
			.orElseThrow(() -> ApiException.notFound("Document not found."));
		MedicalCase medicalCase = caseService.requireOwned(patient, caseId);
		if (!DOCUMENT_STATUSES.contains(medicalCase.getStatus())) {
			throw ApiException.conflict("case_not_eligible_for_visa_documents",
					"Visa documents can be added once the treatment is paid.");
		}
		VisaSubmission submission = submissions.findByCaseId(caseId)
			.orElseGet(() -> submissions.save(new VisaSubmission(caseId, patient.getId())));
		document.linkTo(caseId, submission.getId());
		audit.record(user.id(), user.email(), "patient", "visa.document_linked", "visa_document", documentId,
				Map.of("case_id", caseId.toString()));
		return document;
	}

	@Transactional
	public VisaSubmission submit(CurrentUser user, UUID caseId, VisaForm form) {
		Patient patient = patientService.requireCurrent(user);
		MedicalCase medicalCase = caseService.requireOwned(patient, caseId);
		VisaSubmission submission = submissions.findByCaseId(caseId).orElse(null);
		if (submission != null && submission.isFormSubmitted()) {
			throw ApiException.conflict("visa_already_submitted", "This visa application has already been submitted.");
		}
		if (medicalCase.getStatus() != CaseStatus.PAYMENT_CONFIRMED) {
			throw ApiException.conflict("case_not_eligible_for_visa",
					"The visa application opens once the treatment is paid.");
		}
		List<VisaDocument> caseDocs = documents.findByCaseIdOrderByUploadedAtAsc(caseId);
		if (!lettersReady(caseDocs)) {
			throw ApiException.conflict("hospital_letters_pending",
					"Your hospital hasn't sent the invitation and appointment letters yet.");
		}
		form.validate();
		requireDocuments(form, caseDocs.stream().map(VisaDocument::getCategory).collect(Collectors.toSet()));

		if (submission == null) {
			submission = submissions.save(new VisaSubmission(caseId, patient.getId()));
		}
		submission.submit(jsonMapper.writeValueAsString(form));
		for (VisaDocument letter : documents.findByCaseIdAndSourceAndVisaSubmissionIdIsNull(caseId,
				VisaDocument.HOSPITAL_GENERATED)) {
			letter.linkTo(caseId, submission.getId());
		}
		caseStatus.transition(medicalCase, EnumSet.of(CaseStatus.PAYMENT_CONFIRMED),
				CaseStatus.VISA_DOCUMENTS_SUBMITTED, true);
		notifications.notify(user.id(), "visa_application_submitted", "Visa application submitted",
				"Your visa application for case %s has been submitted.".formatted(medicalCase.getReferenceNumber()),
				caseId);
		// Passport data is sensitive: the audit entry only records that it happened.
		audit.record(user.id(), user.email(), "patient", "visa.application_submitted", "visa_submission",
				submission.getId(), Map.of("case_id", caseId.toString()));
		return submission;
	}

	@Transactional(readOnly = true)
	public List<VisaSubmission> submissionsFor(CurrentUser user) {
		return submissions.findByPatientIdOrderByCreatedAtDesc(patientService.requireCurrent(user).getId());
	}

	/** Paid cases with no submitted application yet, and whether their hospital letters have arrived. */
	@Transactional(readOnly = true)
	public Map<UUID, Boolean> lettersReadyByCase(List<UUID> caseIds) {
		if (caseIds.isEmpty()) {
			return Map.of();
		}
		Map<UUID, List<VisaDocument>> letters = documents
			.findByCaseIdInAndSourceAndSentToPatientAtIsNotNull(caseIds, VisaDocument.HOSPITAL_GENERATED)
			.stream()
			.collect(Collectors.groupingBy(VisaDocument::getCaseId));
		return caseIds.stream()
			.collect(Collectors.toMap(id -> id, id -> lettersReady(letters.getOrDefault(id, List.of()))));
	}

	@Transactional(readOnly = true)
	public Map<UUID, VisaSubmission> submissionsByCase(List<UUID> caseIds) {
		return caseIds.isEmpty() ? Map.of()
				: submissions.findByCaseIdIn(caseIds)
					.stream()
					.collect(Collectors.toMap(VisaSubmission::getCaseId, s -> s));
	}

	@Transactional(readOnly = true)
	public SubmissionDetail detail(CurrentUser user, UUID submissionId) {
		Patient patient = patientService.requireCurrent(user);
		VisaSubmission submission = requireSubmission(patient, submissionId);
		MedicalCase medicalCase = cases.findById(submission.getCaseId()).orElseThrow();
		List<VisaDocument> caseDocs = visible(documents.findByCaseIdOrderByUploadedAtAsc(submission.getCaseId()));
		return new SubmissionDetail(submission, medicalCase, formData(submission), caseDocs,
				openRequests(submission.getCaseId(), caseDocs));
	}

	@Transactional(readOnly = true)
	public List<VisaDocument> allDocuments(CurrentUser user) {
		return visible(documents.findByPatientIdOrderByUploadedAtDesc(patientService.requireCurrent(user).getId()));
	}

	@Transactional(readOnly = true)
	public Stored open(CurrentUser user, UUID documentId) {
		Patient patient = patientService.requireCurrent(user);
		VisaDocument document = documents.findByIdAndPatientId(documentId, patient.getId())
			.filter(VisaService::isVisibleToPatient)
			.orElseThrow(() -> ApiException.notFound("Document not found."));
		return new Stored(document, storage.load(document.getFilePath()));
	}

	public VisaForm formData(VisaSubmission submission) {
		return submission.getFormDataJson() == null ? null
				: jsonMapper.readValue(submission.getFormDataJson(), VisaForm.class);
	}

	private VisaDocument store(Patient patient, MedicalCase medicalCase, VisaSubmission submission, String category,
			MultipartFile file) {
		if (!VisaDocument.UPLOADABLE_CATEGORIES.contains(category)) {
			throw ApiException.badRequest("invalid_category", "Unknown visa document category: " + category);
		}
		Uploads.ValidatedUpload upload = Uploads.validate(file, Uploads.DOCUMENT_MAX_BYTES, FileType.DOCUMENTS);
		if (VisaDocument.PASSPORT_PHOTOGRAPH.equals(category)) {
			checkPassportPhoto(upload);
		}
		UUID id = UUID.randomUUID();
		String folder = medicalCase == null ? "unlinked" : medicalCase.getId().toString();
		String path = "visa-documents/%s/%s/%s/%s%s".formatted(patient.getId(), folder, category, id,
				upload.type().extension());
		storage.store(path, new ByteArrayInputStream(upload.content()));
		boolean requested = medicalCase != null && isOutstandingRequest(medicalCase.getId(), category);
		String name = (medicalCase == null ? "" : medicalCase.getReferenceNumber() + "-") + category
				+ upload.type().extension();
		VisaDocument saved = documents.save(new VisaDocument(id, patient.getId(),
				medicalCase == null ? null : medicalCase.getId(), submission == null ? null : submission.getId(),
				category, name, path, upload.content().length, upload.type().mimeType(), requested));
		audit.record(patient.getUserId(), null, "patient", "visa.document_uploaded", "visa_document", id,
				Map.of("category", category));
		return saved;
	}

	/** Old rule: an upload fulfils a lawyer request for that category made after the last fulfilling upload. */
	private boolean isOutstandingRequest(UUID caseId, String category) {
		List<VisaDocument> caseDocs = documents.findByCaseIdOrderByUploadedAtAsc(caseId);
		return requests.findByCaseIdOrderByCreatedAtAsc(caseId)
			.stream()
			.filter(r -> r.getCategory().equals(category))
			.anyMatch(r -> caseDocs.stream()
				.noneMatch(d -> d.getCategory().equals(category) && d.isRequestedByLawyer()
						&& d.getUploadedAt().isAfter(r.getCreatedAt())));
	}

	private List<VisaDocumentRequest> openRequests(UUID caseId, List<VisaDocument> caseDocs) {
		return requests.findByCaseIdOrderByCreatedAtAsc(caseId)
			.stream()
			.filter(r -> caseDocs.stream()
				.noneMatch(d -> d.getCategory().equals(r.getCategory()) && d.getUploadedAt().isAfter(r.getCreatedAt())))
			.toList();
	}

	private void notifyLawyer(VisaSubmission submission, MedicalCase medicalCase, String message) {
		if (submission.getAssignedLawyerId() == null) {
			return;
		}
		lawyers.findById(submission.getAssignedLawyerId())
			.map(Lawyer::getUserId)
			.ifPresent(lawyerUserId -> notifications.notify(lawyerUserId, "visa_document_uploaded",
					"Patient uploaded a document", message, medicalCase.getId()));
	}

	/** The wizard's document rules, enforced server-side too. */
	private static void requireDocuments(VisaForm form, Set<String> present) {
		if (!present.contains("passport")) {
			throw ApiException.badRequest("passport_required", "Please upload your passport.");
		}
		if (!present.contains(VisaDocument.PASSPORT_PHOTOGRAPH)) {
			throw ApiException.badRequest("passport_photo_required", "Please upload a passport photograph.");
		}
		boolean bank = present.contains("bank_statement");
		boolean sponsorship = present.contains("sponsorship_letter");
		boolean employer = present.contains("employer_letter");
		switch (form.sourceOfFunds()) {
			case VisaForm.SELF_FUNDED -> {
				if (!bank) {
					throw ApiException.badRequest("bank_statement_required", "Please upload a bank statement.");
				}
			}
			case VisaForm.FAMILY_SPONSORED -> {
				if (!sponsorship) {
					throw ApiException.badRequest("sponsorship_letter_required", "Please upload a sponsorship letter.");
				}
			}
			case VisaForm.EMPLOYER_SPONSORED -> {
				if (!sponsorship && !employer) {
					throw ApiException.badRequest("one_doc_required",
							"Please upload a sponsorship letter or an employer letter.");
				}
			}
			default -> {
				if (!bank && !sponsorship && !employer) {
					throw ApiException.badRequest("financial_doc_required",
							"Please upload at least one financial document.");
				}
			}
		}
	}

	/** Passport photos are 35×45 mm; accept a width/height ratio within 10 % (old client-side check). */
	private static void checkPassportPhoto(Uploads.ValidatedUpload upload) {
		if (upload.type() == FileType.PDF) {
			return;
		}
		try {
			BufferedImage image = ImageIO.read(new ByteArrayInputStream(upload.content()));
			if (image == null) {
				return;
			}
			double ratio = (double) image.getWidth() / image.getHeight();
			double expected = 35.0 / 45.0;
			if (Math.abs(ratio - expected) / expected > 0.10) {
				throw ApiException.badRequest("passport_photo_ratio",
						"Passport photos must be portrait with a 35:45 width-to-height ratio.");
			}
		}
		catch (IOException ex) {
			// Unreadable image metadata: let the lawyer review it rather than block the upload.
		}
	}

	/** Hospital letters and lawyer-issued documents appear only once sent to the patient. */
	static boolean isVisibleToPatient(VisaDocument d) {
		return VisaDocument.PATIENT_UPLOAD.equals(d.getSource()) || d.getSentToPatientAt() != null;
	}

	private static List<VisaDocument> visible(List<VisaDocument> docs) {
		return docs.stream().filter(VisaService::isVisibleToPatient).toList();
	}

	private static boolean lettersReady(List<VisaDocument> docs) {
		Set<String> sent = docs.stream()
			.filter(d -> VisaDocument.HOSPITAL_GENERATED.equals(d.getSource()) && d.getSentToPatientAt() != null)
			.map(VisaDocument::getCategory)
			.collect(Collectors.toSet());
		return sent.contains(VisaDocument.HOSPITAL_INVITATION) && sent.contains(VisaDocument.APPOINTMENT_CONFIRMATION);
	}

	private VisaSubmission requireSubmission(Patient patient, UUID submissionId) {
		return submissions.findByIdAndPatientId(submissionId, patient.getId())
			.orElseThrow(() -> ApiException.notFound("Visa application not found."));
	}

	private static String categoryLabel(String category) {
		String spaced = category.replace('_', ' ');
		return Character.toUpperCase(spaced.charAt(0)) + spaced.substring(1);
	}

	public record CaseVisa(MedicalCase medicalCase, VisaSubmission submission, List<VisaDocument> documents,
			boolean lettersReady, List<VisaDocumentRequest> openRequests) {
	}

	public record SubmissionDetail(VisaSubmission submission, MedicalCase medicalCase, VisaForm form,
			List<VisaDocument> documents, List<VisaDocumentRequest> openRequests) {
	}

	public record Stored(VisaDocument document, Resource content) {
	}

}
