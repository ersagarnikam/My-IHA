package com.iha.doctor;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.EnumSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.cases.CaseDocument;
import com.iha.cases.CaseDocumentRepository;
import com.iha.cases.CaseDocumentsAddedEvent;
import com.iha.cases.CaseRepository;
import com.iha.cases.CaseService;
import com.iha.cases.CaseStatus;
import com.iha.cases.CaseStatusService;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.consultation.ConsultationRequest;
import com.iha.notification.NotificationService;
import com.iha.patient.Patient;
import com.iha.patient.PatientRepository;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorCaseAssignment;
import com.iha.provider.DoctorCaseAssignmentRepository;
import com.iha.storage.StorageService;
import com.iha.treatment.TreatmentPlan;
import com.iha.treatment.TreatmentPlanRepository;

import org.springframework.context.event.EventListener;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * A doctor's assigned cases (ported from {@code respond_to_case_assignment},
 * {@code start_case_evaluation}, {@code request_case_additional_info},
 * {@code mark_case_completed} and the doctor case pages). A doctor only ever
 * sees cases they were invited to; anything else is a 404.
 */
@Service
public class DoctorCaseService {

	/** Paid but not yet treated: the doctor confirms treatment took place. */
	static final Set<CaseStatus> COMPLETABLE = EnumSet.of(CaseStatus.PAYMENT_CONFIRMED, CaseStatus.VISA_PROCESSING,
			CaseStatus.TRAVEL_READY);

	static final Map<String, String> DOCUMENT_LABELS = Map.of("lab_report", "Lab Report", "mri_ct", "MRI / CT Scan",
			"xray", "X-Ray", "prescription", "Prescription", "medical_history", "Medical History", "other", "Other");

	private final DoctorAccountService accounts;
	private final DoctorCaseAssignmentRepository assignments;
	private final CaseRepository cases;
	private final CaseStatusService caseStatus;
	private final CaseDocumentRepository documents;
	private final CaseDocumentRequestRepository documentRequests;
	private final PatientRepository patients;
	private final TreatmentPlanRepository plans;
	private final DoctorConsultationService consultations;
	private final NotificationService notifications;
	private final StorageService storage;
	private final AuditService audit;

	DoctorCaseService(DoctorAccountService accounts, DoctorCaseAssignmentRepository assignments, CaseRepository cases,
			CaseStatusService caseStatus, CaseDocumentRepository documents,
			CaseDocumentRequestRepository documentRequests, PatientRepository patients, TreatmentPlanRepository plans,
			DoctorConsultationService consultations, NotificationService notifications, StorageService storage,
			AuditService audit) {
		this.accounts = accounts;
		this.assignments = assignments;
		this.cases = cases;
		this.caseStatus = caseStatus;
		this.documents = documents;
		this.documentRequests = documentRequests;
		this.patients = patients;
		this.plans = plans;
		this.consultations = consultations;
		this.notifications = notifications;
		this.storage = storage;
		this.audit = audit;
	}

	@Transactional(readOnly = true)
	public List<CaseRow> list(CurrentUser user) {
		Doctor doctor = accounts.requireActive(user);
		List<DoctorCaseAssignment> mine = assignments.findByDoctorIdOrderByInvitedAtDesc(doctor.getId());
		Map<UUID, MedicalCase> caseById = byId(cases.findAllById(mine.stream().map(DoctorCaseAssignment::getCaseId).toList()),
				MedicalCase::getId);
		Map<UUID, Patient> patientById = byId(
				patients.findAllById(caseById.values().stream().map(MedicalCase::getPatientId).toList()), Patient::getId);
		Map<UUID, TreatmentPlan> planByCase = byId(plans.findByDoctorId(doctor.getId()), TreatmentPlan::getCaseId);
		return mine.stream().filter(a -> caseById.containsKey(a.getCaseId())).map(a -> {
			MedicalCase c = caseById.get(a.getCaseId());
			Patient p = patientById.get(c.getPatientId());
			TreatmentPlan plan = planByCase.get(c.getId());
			return new CaseRow(a, c, p == null ? null : p.getFullName(), plan == null ? null : plan.getStatus(),
					plan == null ? null : plan.getTreatmentStartDate(), plan == null ? null : plan.getTreatmentEndDate(),
					a.isAccepted() ? consultations.initialState(doctor, a).state() : null);
		}).toList();
	}

	@Transactional(readOnly = true)
	public CaseDetail detail(CurrentUser user, UUID caseId) {
		Doctor doctor = accounts.requireActive(user);
		DoctorCaseAssignment assignment = requireAssignment(doctor, caseId);
		MedicalCase medicalCase = cases.findById(caseId).orElseThrow(() -> ApiException.notFound("Case not found."));
		Patient patient = patients.findById(medicalCase.getPatientId()).orElse(null);
		TreatmentPlan plan = plans.findByCaseIdAndDoctorId(caseId, doctor.getId()).orElse(null);
		return new CaseDetail(assignment, medicalCase, patient, documents.findByCaseIdOrderByUploadedAtAsc(caseId),
				documentRequests.findByCaseIdOrderByRequestedAtDesc(caseId), plan,
				consultations.requestsForCase(doctor, caseId),
				assignment.isAccepted() ? consultations.initialState(doctor, assignment) : null);
	}

	@Transactional(readOnly = true)
	public CaseService.StoredDocument openDocument(CurrentUser user, UUID caseId, UUID documentId) {
		Doctor doctor = accounts.requireActive(user);
		requireAssignment(doctor, caseId);
		CaseDocument document = documents.findByIdAndCaseId(documentId, caseId)
			.orElseThrow(() -> ApiException.notFound("Document not found."));
		Resource content = storage.load(document.getFilePath());
		audit.record(user.id(), user.email(), "doctor", "case_document.viewed", "case_document", documentId,
				Map.of("case_id", caseId.toString()));
		return new CaseService.StoredDocument(document, content);
	}

	/** Accept or decline an invitation, or withdraw after accepting. */
	@Transactional
	public DoctorCaseAssignment respond(CurrentUser user, UUID assignmentId, String status, String declineReason) {
		Doctor doctor = accounts.requireActive(user);
		DoctorCaseAssignment assignment = assignments.findByIdAndDoctorId(assignmentId, doctor.getId())
			.orElseThrow(() -> ApiException.notFound("This case assignment could not be found."));
		boolean fromInvite = DoctorCaseAssignment.ACCEPTED.equals(status) || DoctorCaseAssignment.DECLINED.equals(status);
		if (!fromInvite && !DoctorCaseAssignment.WITHDRAWN.equals(status)) {
			throw ApiException.badRequest("invalid_status", "Invalid response.");
		}
		String required = fromInvite ? DoctorCaseAssignment.INVITED : DoctorCaseAssignment.ACCEPTED;
		if (!required.equals(assignment.getStatus())) {
			throw ApiException.conflict("invalid_transition", "This case has already been responded to.");
		}
		String reason = declineReason == null || declineReason.isBlank() ? null : declineReason.trim();
		assignment.respond(status, reason);
		if (DoctorCaseAssignment.ACCEPTED.equals(status)) {
			MedicalCase medicalCase = cases.findById(assignment.getCaseId()).orElseThrow();
			if (medicalCase.getStatus() == CaseStatus.UNDER_REVIEW) {
				caseStatus.transition(medicalCase, EnumSet.of(CaseStatus.UNDER_REVIEW), CaseStatus.DOCTOR_ASSIGNED,
						false);
			}
		}
		audit.record(user.id(), user.email(), "doctor", "case_assignment." + status, "case", assignment.getCaseId(),
				Map.of("assignment_id", assignmentId.toString()));
		return assignment;
	}

	/** doctor_assigned → evaluation for the case; each doctor's own start is tracked on their assignment. */
	@Transactional
	public void startEvaluation(CurrentUser user, UUID caseId) {
		Doctor doctor = accounts.requireActive(user);
		DoctorCaseAssignment assignment = requireAccepted(doctor, caseId);
		MedicalCase medicalCase = cases.findById(caseId).orElseThrow(() -> ApiException.notFound("Case not found."));
		if (medicalCase.getStatus() != CaseStatus.DOCTOR_ASSIGNED && medicalCase.getStatus() != CaseStatus.EVALUATION) {
			throw ApiException.conflict("invalid_transition",
					"This case is no longer in the right stage for that action.");
		}
		caseStatus.transition(medicalCase, EnumSet.of(CaseStatus.DOCTOR_ASSIGNED), CaseStatus.EVALUATION, false);
		assignment.markEvaluationStarted();
		audit.record(user.id(), user.email(), "doctor", "case.evaluation_started", "case", caseId, Map.of());
	}

	/**
	 * Asks the patient for more documents. Each requested type is tracked until
	 * the patient adds one; the patient gets the old wording plus email/SMS.
	 */
	@Transactional
	public List<CaseDocumentRequest> requestDocuments(CurrentUser user, UUID caseId, List<String> documentTypes,
			String message) {
		Doctor doctor = accounts.requireActive(user);
		requireAccepted(doctor, caseId);
		MedicalCase medicalCase = cases.findById(caseId).orElseThrow(() -> ApiException.notFound("Case not found."));
		if (medicalCase.getStatus() != CaseStatus.EVALUATION) {
			throw ApiException.conflict("case_not_in_evaluation",
					"This action is only available while the case is in evaluation.");
		}
		Set<String> types = new LinkedHashSet<>(documentTypes == null ? List.of() : documentTypes);
		if (!DOCUMENT_LABELS.keySet().containsAll(types)) {
			throw ApiException.badRequest("invalid_document_type", "Unknown document type.");
		}
		String note = message == null || message.isBlank() ? null : message.trim();
		if (types.isEmpty() && (note == null || note.length() < 10)) {
			throw ApiException.badRequest("request_required",
					"Select at least one document or describe what you need (min. 10 characters).");
		}
		List<CaseDocumentRequest> created = types.stream()
			.map(type -> documentRequests.save(new CaseDocumentRequest(caseId, doctor.getId(), type, note)))
			.toList();

		StringBuilder composed = new StringBuilder();
		if (!types.isEmpty()) {
			composed.append("Requested documents: ")
				.append(types.stream().map(DOCUMENT_LABELS::get).collect(Collectors.joining(", ")));
		}
		if (note != null) {
			composed.append(composed.isEmpty() ? "" : "\n\n").append(note);
		}
		patients.findById(medicalCase.getPatientId())
			.ifPresent(p -> notifications.notifyWithAlert(p.getUserId(), "additional_info_requested",
					"Your doctor requested additional documents",
					"For case " + medicalCase.getReferenceNumber() + ": " + composed, caseId));
		audit.record(user.id(), user.email(), "doctor", "case.additional_info_requested", "case", caseId,
				Map.of("document_types", String.join(",", types)));
		return created;
	}

	/** Treatment has taken place (only once the plan's end date has passed). */
	@Transactional
	public void markCompleted(CurrentUser user, UUID caseId) {
		Doctor doctor = accounts.requireActive(user);
		requireAccepted(doctor, caseId);
		MedicalCase medicalCase = cases.findById(caseId).orElseThrow(() -> ApiException.notFound("Case not found."));
		if (!COMPLETABLE.contains(medicalCase.getStatus())) {
			throw ApiException.conflict("invalid_transition",
					"This case is no longer in the right stage for that action.");
		}
		LocalDate today = LocalDate.now(ZoneId.of("Australia/Brisbane"));
		plans.findByCaseIdAndDoctorId(caseId, doctor.getId())
			.map(TreatmentPlan::getTreatmentEndDate)
			.filter(end -> end.isAfter(today))
			.ifPresent(end -> {
				throw ApiException.conflict("treatment_not_finished",
						"You can mark the case completed once the treatment end date has passed.");
			});
		caseStatus.transition(medicalCase, COMPLETABLE, CaseStatus.COMPLETED, true);
		audit.record(user.id(), user.email(), "doctor", "case.marked_completed", "case", caseId, Map.of());
	}

	/** Patient uploads close the matching open requests. */
	@EventListener
	void onDocumentsAdded(CaseDocumentsAddedEvent event) {
		if (event.documentTypes().isEmpty()) {
			return;
		}
		documentRequests
			.findByCaseIdAndStatusAndDocumentTypeIn(event.caseId(), CaseDocumentRequest.PENDING, event.documentTypes())
			.forEach(CaseDocumentRequest::markReceived);
	}

	DoctorCaseAssignment requireAssignment(Doctor doctor, UUID caseId) {
		return assignments.findByCaseIdAndDoctorId(caseId, doctor.getId())
			.orElseThrow(() -> ApiException.notFound("Case not found."));
	}

	DoctorCaseAssignment requireAccepted(Doctor doctor, UUID caseId) {
		DoctorCaseAssignment assignment = requireAssignment(doctor, caseId);
		if (!assignment.isAccepted()) {
			throw ApiException.conflict("case_not_assigned", "You must accept this case first.");
		}
		return assignment;
	}

	private static <T> Map<UUID, T> byId(List<T> list, Function<T, UUID> key) {
		return list.stream().collect(Collectors.toMap(key, Function.identity(), (a, b) -> a));
	}

	/** @param initialConsultation see {@link DoctorConsultationService#initialState}; null until accepted */
	public record CaseRow(DoctorCaseAssignment assignment, MedicalCase medicalCase, String patientName,
			String planStatus, LocalDate treatmentStartDate, LocalDate treatmentEndDate, String initialConsultation) {
	}

	public record CaseDetail(DoctorCaseAssignment assignment, MedicalCase medicalCase, Patient patient,
			List<CaseDocument> documents, List<CaseDocumentRequest> documentRequests, TreatmentPlan plan,
			List<ConsultationRequest> consultations, DoctorConsultationService.InitialState initialConsultation) {
	}

}
