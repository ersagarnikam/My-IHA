package com.iha.lawyer;

import java.io.ByteArrayInputStream;
import java.time.Instant;
import java.time.LocalDate;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.cases.CaseRepository;
import com.iha.cases.CaseStatus;
import com.iha.cases.CaseStatusService;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.notification.NotificationService;
import com.iha.patient.Patient;
import com.iha.patient.PatientRepository;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorRepository;
import com.iha.provider.Hospital;
import com.iha.provider.HospitalRepository;
import com.iha.provider.Lawyer;
import com.iha.storage.FileType;
import com.iha.storage.StorageService;
import com.iha.storage.Uploads;
import com.iha.treatment.TreatmentOption;
import com.iha.treatment.TreatmentOptionRepository;
import com.iha.treatment.TreatmentPlan;
import com.iha.treatment.TreatmentPlanRepository;
import com.iha.visa.VisaCaseNote;
import com.iha.visa.VisaCaseNoteRepository;
import com.iha.visa.VisaDocument;
import com.iha.visa.VisaDocumentRepository;
import com.iha.visa.VisaDocumentRequest;
import com.iha.visa.VisaDocumentRequestRepository;
import com.iha.visa.VisaForm;
import com.iha.visa.VisaService;
import com.iha.visa.VisaSubmission;
import com.iha.visa.VisaSubmissionRepository;

import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * The visa cases assigned to a lawyer (ported from {@code apps/visa}: the
 * {@code update_visa_submission_status}, {@code request_visa_document} and
 * {@code record_lawyer_visa_document} RPCs, the case-notes insert, the
 * {@code sync_case_status_from_visa} trigger and the notifications the server
 * actions sent). A lawyer sees only submissions assigned to them; anything
 * else is 404.
 */
@Service
public class LawyerCaseService {

	/** Case status that follows each visa outcome (old {@code sync_case_status_from_visa}). */
	private static final Map<String, CaseStatus> CASE_STATUS = Map.of(VisaSubmission.PROCESSING,
			CaseStatus.VISA_PROCESSING, VisaSubmission.APPROVED, CaseStatus.TRAVEL_READY, VisaSubmission.REJECTED,
			CaseStatus.VISA_REJECTED);

	private static final Set<CaseStatus> VISA_STAGES = EnumSet.of(CaseStatus.PAYMENT_CONFIRMED,
			CaseStatus.VISA_DOCUMENTS_SUBMITTED, CaseStatus.VISA_PROCESSING);

	static final Map<String, String> CATEGORY_LABELS = Map.ofEntries(Map.entry("passport", "Passport Copy"),
			Map.entry("passport_photograph", "Passport Size Photograph"),
			Map.entry("hospital_invitation", "Hospital Invitation Letter"),
			Map.entry("appointment_confirmation", "Appointment Confirmation Letter"),
			Map.entry("bank_statement", "Bank Statement"), Map.entry("sponsorship_letter", "Sponsorship Letter"),
			Map.entry("employer_letter", "Employer Letter"), Map.entry("companion_passport", "Companion Passport Copy"),
			Map.entry("companion_proof_of_relationship", "Proof of Relationship"),
			Map.entry("approved_visa", "Approved Visa"));

	private final LawyerAccountService accounts;
	private final VisaSubmissionRepository submissions;
	private final VisaDocumentRepository documents;
	private final VisaDocumentRequestRepository requests;
	private final VisaCaseNoteRepository notes;
	private final VisaService visa;
	private final CaseRepository cases;
	private final CaseStatusService caseStatus;
	private final PatientRepository patients;
	private final TreatmentOptionRepository options;
	private final TreatmentPlanRepository plans;
	private final DoctorRepository doctors;
	private final HospitalRepository hospitals;
	private final NotificationService notifications;
	private final StorageService storage;
	private final AuditService audit;

	LawyerCaseService(LawyerAccountService accounts, VisaSubmissionRepository submissions,
			VisaDocumentRepository documents, VisaDocumentRequestRepository requests, VisaCaseNoteRepository notes,
			VisaService visa, CaseRepository cases, CaseStatusService caseStatus, PatientRepository patients,
			TreatmentOptionRepository options, TreatmentPlanRepository plans, DoctorRepository doctors,
			HospitalRepository hospitals, NotificationService notifications, StorageService storage,
			AuditService audit) {
		this.accounts = accounts;
		this.submissions = submissions;
		this.documents = documents;
		this.requests = requests;
		this.notes = notes;
		this.visa = visa;
		this.cases = cases;
		this.caseStatus = caseStatus;
		this.patients = patients;
		this.options = options;
		this.plans = plans;
		this.doctors = doctors;
		this.hospitals = hospitals;
		this.notifications = notifications;
		this.storage = storage;
		this.audit = audit;
	}

	// ── Lists ───────────────────────────────────────────────────────────────

	@Transactional(readOnly = true)
	public Dashboard dashboard(CurrentUser user) {
		List<CaseRow> rows = cases(user);
		Map<String, Long> byBucket = rows.stream().collect(Collectors.groupingBy(CaseRow::bucket, Collectors.counting()));
		return new Dashboard(byBucket.getOrDefault("new", 0L),
				byBucket.getOrDefault("under_review", 0L) + byBucket.getOrDefault("docs_pending", 0L)
						+ byBucket.getOrDefault("in_progress", 0L),
				byBucket.getOrDefault("approved", 0L), byBucket.getOrDefault("docs_pending", 0L),
				rows.stream().limit(5).toList());
	}

	/** Assigned cases, most recently updated first. */
	@Transactional(readOnly = true)
	public List<CaseRow> cases(CurrentUser user) {
		Lawyer lawyer = accounts.requireApproved(user);
		List<VisaSubmission> mine = submissions.findByAssignedLawyerIdOrderByUpdatedAtDesc(lawyer.getId());
		Map<UUID, MedicalCase> caseById = cases.findAllById(mine.stream().map(VisaSubmission::getCaseId).toList())
			.stream()
			.collect(Collectors.toMap(MedicalCase::getId, Function.identity()));
		Map<UUID, Patient> patientById = patients
			.findAllById(mine.stream().map(VisaSubmission::getPatientId).distinct().toList())
			.stream()
			.collect(Collectors.toMap(Patient::getId, Function.identity()));
		return mine.stream().map(s -> row(s, caseById.get(s.getCaseId()), patientById.get(s.getPatientId()))).toList();
	}

	/** Approved cases and the visa the lawyer issued for each (Documents page). */
	@Transactional(readOnly = true)
	public List<ApprovedRow> approved(CurrentUser user) {
		List<CaseRow> rows = cases(user).stream().filter(r -> VisaSubmission.APPROVED.equals(r.status())).toList();
		Map<UUID, VisaDocument> issued = rows.isEmpty() ? Map.of()
				: documents.findByCaseIdInAndSource(rows.stream().map(CaseRow::caseId).toList(), VisaDocument.LAWYER_ISSUED)
					.stream()
					.filter(d -> VisaDocument.APPROVED_VISA.equals(d.getCategory()))
					.collect(Collectors.toMap(VisaDocument::getCaseId, Function.identity(), (a, b) -> a));
		return rows.stream()
			.map(r -> new ApprovedRow(r, Optional.ofNullable(issued.get(r.caseId())).map(DocView::of).orElse(null)))
			.toList();
	}

	// ── One case ────────────────────────────────────────────────────────────

	@Transactional(readOnly = true)
	public CaseDetail detail(CurrentUser user, UUID caseId) {
		Lawyer lawyer = accounts.requireApproved(user);
		VisaSubmission s = requireAssigned(lawyer, caseId);
		MedicalCase c = cases.findById(caseId).orElseThrow();
		Patient p = patients.findById(s.getPatientId()).orElseThrow();
		List<VisaDocument> caseDocs = documents.findByCaseIdOrderByUploadedAtAsc(caseId)
			.stream()
			.filter(d -> !VisaDocument.HOSPITAL_GENERATED.equals(d.getSource()) || d.getSentToPatientAt() != null)
			.toList();
		List<RequestView> requestViews = requests.findByCaseIdOrderByCreatedAtAsc(caseId)
			.stream()
			.map(r -> new RequestView(r.getId(), r.getCategory(), label(r.getCategory()), r.getDocumentType(),
					r.getInstructions(), r.getCreatedAt(), caseDocs.stream()
						.noneMatch(d -> d.getCategory().equals(r.getCategory())
								&& d.getUploadedAt().isAfter(r.getCreatedAt()))))
			.toList();
		VisaForm form = visa.formData(s);
		return new CaseDetail(row(s, c, p), new PatientView(p.getFullName(), p.getDateOfBirth(), p.getGender(),
				p.getNationality(), p.getCountryOfResidence()), s.getRejectionReason(), form,
				caseDocs.stream().map(DocView::of).toList(), requestViews,
				notes.findByCaseIdAndLawyerIdOrderByCreatedAtDesc(caseId, lawyer.getId())
					.stream()
					.map(NoteView::of)
					.toList(),
				plan(caseId), VisaSubmission.TRANSITIONS.getOrDefault(s.getStatus(), Set.of()).stream().sorted().toList(),
				VisaSubmission.REQUESTS_OPEN.contains(s.getStatus()));
	}

	/** Moves the application on; the patient (and, for the outcome, the doctor and hospital) are told. */
	@Transactional
	public CaseDetail updateStatus(CurrentUser user, UUID caseId, String status, String rejectionReason) {
		Lawyer lawyer = accounts.requireApproved(user);
		VisaSubmission s = requireAssigned(lawyer, caseId);
		if (!VisaSubmission.TRANSITIONS.getOrDefault(s.getStatus(), Set.of()).contains(status)) {
			throw ApiException.conflict("invalid_transition", "The visa application can't move to that status now.");
		}
		String reason = rejectionReason == null ? "" : rejectionReason.trim();
		if (VisaSubmission.REJECTED.equals(status) && reason.isEmpty()) {
			throw ApiException.badRequest("rejection_reason_required", "A rejection reason is required.");
		}
		s.changeStatus(status, reason);
		submissions.saveAndFlush(s);
		MedicalCase c = cases.findById(caseId).orElseThrow();
		CaseStatus next = CASE_STATUS.get(status);
		if (next != null) {
			Set<CaseStatus> from = EnumSet.copyOf(VISA_STAGES);
			from.remove(next);
			caseStatus.transition(c, from, next, false);
		}
		patientNotice(status, reason).ifPresent(n -> patientUserId(s).ifPresent(
				uid -> notifications.notifyWithAlert(uid, "visa_status_updated", n.title(), n.message(), caseId)));
		providerNotice(status, reason).ifPresent(n -> providerUserIds(caseId)
			.forEach(uid -> notifications.notifyWithAlert(uid, "visa_status_updated", n.title(), n.message(), caseId)));
		audit.record(user.id(), user.email(), "lawyer", "visa.status_updated", "case", caseId, Map.of("status", status));
		return detail(user, caseId);
	}

	@Transactional
	public CaseDetail requestDocument(CurrentUser user, UUID caseId, String category, String documentType,
			String instructions) {
		Lawyer lawyer = accounts.requireApproved(user);
		VisaSubmission s = requireAssigned(lawyer, caseId);
		if (!VisaDocument.UPLOADABLE_CATEGORIES.contains(category)) {
			throw ApiException.badRequest("invalid_category", "Choose a document the patient can upload.");
		}
		String type = documentType == null ? "" : documentType.trim();
		if (type.isEmpty()) {
			throw ApiException.badRequest("document_type_required", "Describe the document you need.");
		}
		if (!VisaSubmission.REQUESTS_OPEN.contains(s.getStatus())) {
			throw ApiException.conflict("case_not_under_review",
					"Document requests are only available while the case is under review.");
		}
		String note = instructions == null || instructions.isBlank() ? null : instructions.trim();
		requests.save(new VisaDocumentRequest(caseId, lawyer.getId(), category, type, note));
		s.documentsRequested();
		patientUserId(s).ifPresent(uid -> notifications.notifyWithAlert(uid, "document_requested",
				"Your visa lawyer requested a document",
				"Please upload: %s — %s%s".formatted(label(category), type, note == null ? "" : " (" + note + ")"),
				caseId));
		audit.record(user.id(), user.email(), "lawyer", "visa.document_requested", "case", caseId,
				Map.of("category", category));
		return detail(user, caseId);
	}

	@Transactional
	public NoteView addNote(CurrentUser user, UUID caseId, String body) {
		Lawyer lawyer = accounts.requireApproved(user);
		requireAssigned(lawyer, caseId);
		String text = body == null ? "" : body.trim();
		if (text.isEmpty()) {
			throw ApiException.badRequest("note_required", "Note can't be empty");
		}
		if (text.length() > 5000) {
			throw ApiException.badRequest("note_too_long", "Note must be under 5000 characters");
		}
		return NoteView.of(notes.save(new VisaCaseNote(caseId, lawyer.getId(), text)));
	}

	/** The approved visa for the patient; replacing it re-sends it. Only once the case is approved. */
	@Transactional
	public DocView uploadApprovedVisa(CurrentUser user, UUID caseId, MultipartFile file) {
		Lawyer lawyer = accounts.requireApproved(user);
		VisaSubmission s = requireAssigned(lawyer, caseId);
		if (!VisaSubmission.APPROVED.equals(s.getStatus())) {
			throw ApiException.conflict("visa_not_approved",
					"The visa document can only be uploaded once this case has been marked Approved.");
		}
		Uploads.ValidatedUpload upload = Uploads.validate(file, Uploads.DOCUMENT_MAX_BYTES, FileType.DOCUMENTS);
		String path = "visa-documents/lawyer-issued/%s/%s%s".formatted(caseId, UUID.randomUUID(),
				upload.type().extension());
		storage.store(path, new ByteArrayInputStream(upload.content()));
		MedicalCase c = cases.findById(caseId).orElseThrow();
		String name = c.getReferenceNumber() + "-approved-visa" + upload.type().extension();
		VisaDocument doc = documents
			.findFirstByCaseIdAndSourceAndCategory(caseId, VisaDocument.LAWYER_ISSUED, VisaDocument.APPROVED_VISA)
			.map(existing -> {
				String previous = existing.getFilePath();
				existing.reissue(name, path, upload.content().length, upload.type().mimeType());
				storage.delete(previous);
				return existing;
			})
			.orElseGet(() -> documents.save(VisaDocument.lawyerIssued(s.getPatientId(), caseId, s.getId(), name, path,
					upload.content().length, upload.type().mimeType())));
		patientUserId(s).ifPresent(uid -> notifications.notifyWithAlert(uid, "visa_document_available",
				"Your approved visa is ready",
				"Your visa lawyer has uploaded your approved visa — download it from your Visa & Travel section.",
				caseId));
		audit.record(user.id(), user.email(), "lawyer", "visa.approved_visa_uploaded", "case", caseId, Map.of());
		return DocView.of(doc);
	}

	@Transactional(readOnly = true)
	public VisaService.Stored openDocument(CurrentUser user, UUID caseId, UUID documentId) {
		requireAssigned(accounts.requireApproved(user), caseId);
		VisaDocument doc = documents.findById(documentId)
			.filter(d -> caseId.equals(d.getCaseId()))
			.orElseThrow(() -> ApiException.notFound("Document not found."));
		return new VisaService.Stored(doc, storage.load(doc.getFilePath()));
	}

	// ── Helpers ─────────────────────────────────────────────────────────────

	private VisaSubmission requireAssigned(Lawyer lawyer, UUID caseId) {
		return submissions.findByCaseId(caseId)
			.filter(s -> lawyer.getId().equals(s.getAssignedLawyerId()))
			.orElseThrow(() -> ApiException.notFound("Case not found."));
	}

	private CaseRow row(VisaSubmission s, MedicalCase c, Patient p) {
		return new CaseRow(s.getCaseId(), c == null ? null : c.getReferenceNumber(), p == null ? null : p.getFullName(),
				p == null ? null : p.getCountryOfResidence(), s.getStatus(), bucket(s.getStatus()), s.getCreatedAt(),
				s.getUpdatedAt());
	}

	/** The chosen plan's logistics (old {@code fetchCaseDetailForLawyer}). */
	private PlanView plan(UUID caseId) {
		return options.findByCaseIdAndPublishedAtIsNotNullOrderByCreatedAtAsc(caseId)
			.stream()
			.filter(TreatmentOption::isSelected)
			.findFirst()
			.flatMap(o -> plans.findById(o.getTreatmentPlanId()))
			.map(plan -> new PlanView(hospitals.findById(plan.getHospitalId()).map(Hospital::getName).orElse(null),
					doctors.findById(plan.getDoctorId()).map(Doctor::getFullName).orElse(null),
					cases.findById(caseId).map(MedicalCase::getSpecialty).orElse(null), plan.getProcedureName(),
					plan.getTreatmentStartDate(), plan.getTreatmentEndDate(), plan.getEstimatedLengthOfStay()))
			.orElse(null);
	}

	private Optional<UUID> patientUserId(VisaSubmission s) {
		return patients.findById(s.getPatientId()).map(Patient::getUserId);
	}

	/** The chosen plan's doctor and hospital logins (old {@code get_case_provider_user_ids}). */
	private List<UUID> providerUserIds(UUID caseId) {
		return options.findByCaseIdAndPublishedAtIsNotNullOrderByCreatedAtAsc(caseId)
			.stream()
			.filter(TreatmentOption::isSelected)
			.findFirst()
			.flatMap(o -> plans.findById(o.getTreatmentPlanId()))
			.map(plan -> Stream.of(hospitals.findById(plan.getHospitalId()).map(Hospital::getUserId).orElse(null),
						doctors.findById(plan.getDoctorId()).map(Doctor::getUserId).orElse(null))
				.filter(Objects::nonNull)
				.toList())
			.orElse(List.of());
	}

	static String bucket(String status) {
		return switch (status) {
			case VisaSubmission.DOCUMENTS_SUBMITTED -> "new";
			case VisaSubmission.UNDER_REVIEW -> "under_review";
			case VisaSubmission.ADDITIONAL_DOCS_REQUESTED -> "docs_pending";
			case VisaSubmission.APPLICATION_SUBMITTED, VisaSubmission.PROCESSING -> "in_progress";
			default -> status;
		};
	}

	static String label(String category) {
		return CATEGORY_LABELS.getOrDefault(category, category);
	}

	private static Optional<Notice> patientNotice(String status, String reason) {
		return Optional.ofNullable(switch (status) {
			case VisaSubmission.UNDER_REVIEW -> new Notice("Your visa lawyer is reviewing your application",
					"Your visa lawyer has started reviewing your visa application.");
			case VisaSubmission.APPLICATION_SUBMITTED -> new Notice("Visa application submitted",
					"Your visa application has been submitted to the immigration authorities.");
			case VisaSubmission.PROCESSING -> new Notice("Visa application processing",
					"Your visa application is being processed by the immigration authorities.");
			case VisaSubmission.APPROVED -> new Notice("Visa approved", "Your visa application has been approved.");
			case VisaSubmission.REJECTED -> new Notice("Visa application rejected",
					"Your visa application was not approved. Reason: " + reason);
			default -> null;
		});
	}

	private static Optional<Notice> providerNotice(String status, String reason) {
		return Optional.ofNullable(switch (status) {
			case VisaSubmission.APPROVED -> new Notice("Patient's visa approved",
					"Your patient's visa application has been approved.");
			case VisaSubmission.REJECTED -> new Notice("Patient's visa rejected",
					"Your patient's visa application was not approved. Reason: " + reason);
			default -> null;
		});
	}

	private record Notice(String title, String message) {
	}

	/** {@code bucket}: new, under_review, docs_pending, in_progress, approved or rejected. */
	public record CaseRow(UUID caseId, String referenceNumber, String patientName, String country, String status,
			String bucket, Instant createdAt, Instant updatedAt) {
	}

	public record Dashboard(long newCases, long inProgress, long approved, long docsPending, List<CaseRow> recent) {
	}

	public record ApprovedRow(CaseRow row, DocView approvedVisa) {
	}

	public record PatientView(String fullName, LocalDate dateOfBirth, String gender, String nationality,
			String countryOfResidence) {
	}

	public record DocView(UUID id, String category, String label, String source, String fileName, String mimeType,
			Long fileSizeBytes, boolean requestedByLawyer, Instant uploadedAt) {

		static DocView of(VisaDocument d) {
			return new DocView(d.getId(), d.getCategory(), LawyerCaseService.label(d.getCategory()), d.getSource(), d.getFileName(),
					d.getMimeType(), d.getFileSizeBytes(), d.isRequestedByLawyer(), d.getUploadedAt());
		}

	}

	public record RequestView(UUID id, String category, String label, String documentType, String instructions,
			Instant createdAt, boolean open) {
	}

	public record NoteView(UUID id, String body, Instant createdAt) {

		static NoteView of(VisaCaseNote n) {
			return new NoteView(n.getId(), n.getBody(), n.getCreatedAt());
		}

	}

	public record PlanView(String hospitalName, String doctorName, String specialty, String procedureName,
			LocalDate treatmentStartDate, LocalDate treatmentEndDate, String estimatedLengthOfStay) {
	}

	/** {@code nextStatuses}: what the lawyer may move the application to now. */
	public record CaseDetail(CaseRow row, PatientView patient, String rejectionReason, VisaForm form,
			List<DocView> documents, List<RequestView> requests, List<NoteView> notes, PlanView plan,
			List<String> nextStatuses, boolean canRequestDocuments) {
	}

}
