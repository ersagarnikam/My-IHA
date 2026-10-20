package com.iha.doctor;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.iha.auth.CurrentUser;
import com.iha.cases.CaseDocument;
import com.iha.cases.CaseService;
import com.iha.cases.CaseStatus;
import com.iha.cases.MedicalCase;
import com.iha.consultation.ConsultationRequest;
import com.iha.documents.PatientDocumentController;
import com.iha.patient.Patient;
import com.iha.provider.DoctorCaseAssignment;
import com.iha.treatment.TreatmentPlan;
import com.iha.treatment.TreatmentPlanSpecialist;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** My Cases, case details, the case workflow buttons and the treatment plan builder. */
@RestController
@RequestMapping("/api/doctor")
public class DoctorCaseController {

	private final DoctorCaseService caseService;
	private final DoctorPlanService planService;
	private final DoctorConsultationService consultationService;

	DoctorCaseController(DoctorCaseService caseService, DoctorPlanService planService,
			DoctorConsultationService consultationService) {
		this.caseService = caseService;
		this.planService = planService;
		this.consultationService = consultationService;
	}

	@GetMapping("/cases")
	public List<CaseRowResponse> list(@AuthenticationPrincipal Jwt jwt) {
		return caseService.list(CurrentUser.from(jwt)).stream().map(CaseRowResponse::of).toList();
	}

	@GetMapping("/cases/{caseId}")
	public CaseDetailResponse detail(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId) {
		return CaseDetailResponse.of(caseService.detail(CurrentUser.from(jwt), caseId));
	}

	@GetMapping("/cases/{caseId}/documents/{documentId}/content")
	public ResponseEntity<Resource> document(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
			@PathVariable UUID documentId, @RequestParam(defaultValue = "false") boolean download) {
		CaseService.StoredDocument stored = caseService.openDocument(CurrentUser.from(jwt), caseId, documentId);
		return PatientDocumentController.file(stored.content(), stored.document().getMimeType(),
				stored.document().getFileName(), download);
	}

	/** {@code status}: accepted, declined (optionally with a reason) or withdrawn. */
	@PostMapping("/assignments/{assignmentId}/respond")
	public AssignmentResponse respond(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID assignmentId,
			@Valid @RequestBody RespondRequest request) {
		return AssignmentResponse.of(caseService.respond(CurrentUser.from(jwt), assignmentId, request.status(),
				request.declineReason()));
	}

	@PostMapping("/cases/{caseId}/start-evaluation")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void startEvaluation(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId) {
		caseService.startEvaluation(CurrentUser.from(jwt), caseId);
	}

	@PostMapping("/cases/{caseId}/document-requests")
	@ResponseStatus(HttpStatus.CREATED)
	public List<DocumentRequestResponse> requestDocuments(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
			@Valid @RequestBody DocumentRequestRequest request) {
		return caseService.requestDocuments(CurrentUser.from(jwt), caseId, request.documentTypes(), request.message())
			.stream()
			.map(DocumentRequestResponse::of)
			.toList();
	}

	@PostMapping("/cases/{caseId}/complete")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void complete(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId) {
		caseService.markCompleted(CurrentUser.from(jwt), caseId);
	}

	/** Proposes 1-3 times for the initial Zoom consultation (during evaluation, before the plan). */
	@PostMapping("/cases/{caseId}/initial-consultation")
	@ResponseStatus(HttpStatus.CREATED)
	public DoctorConsultationController.ConsultationResponse proposeInitialConsultation(
			@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
			@RequestBody DoctorConsultationController.ProposeSlotsRequest request) {
		return DoctorConsultationController.ConsultationResponse
			.of(consultationService.proposeInitial(CurrentUser.from(jwt), caseId, request.slots()));
	}

	/** Records why no initial consultation is needed (visible to MTA); unlocks plan submission. */
	@PostMapping("/cases/{caseId}/initial-consultation/skip")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void skipInitialConsultation(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
			@Valid @RequestBody SkipRequest request) {
		consultationService.skipInitial(CurrentUser.from(jwt), caseId, request.reason());
	}

	@GetMapping("/cases/{caseId}/treatment-plan")
	public PlanResponse plan(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId) {
		return PlanResponse.of(planService.get(CurrentUser.from(jwt), caseId));
	}

	@PutMapping("/cases/{caseId}/treatment-plan")
	public PlanResponse saveDraft(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
			@RequestBody DoctorPlanService.PlanInput input) {
		return PlanResponse.of(planService.saveDraft(CurrentUser.from(jwt), caseId, input));
	}

	@PostMapping("/cases/{caseId}/treatment-plan/submit")
	public PlanResponse submit(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
			@RequestBody DoctorPlanService.PlanInput input) {
		return PlanResponse.of(planService.submit(CurrentUser.from(jwt), caseId, input));
	}

	public record SkipRequest(@NotBlank @Size(max = 500) String reason) {
	}

	public record RespondRequest(@NotBlank String status, @Size(max = 500) String declineReason) {
	}

	public record DocumentRequestRequest(List<String> documentTypes, @Size(max = 900) String message) {
	}

	public record AssignmentResponse(UUID id, String status, String declineReason, Instant invitedAt,
			Instant respondedAt, Instant evaluationStartedAt, Instant planSubmittedAt,
			String consultationSkippedReason) {

		static AssignmentResponse of(DoctorCaseAssignment a) {
			return new AssignmentResponse(a.getId(), a.getStatus(), a.getDeclineReason(), a.getInvitedAt(),
					a.getRespondedAt(), a.getEvaluationStartedAt(), a.getPlanSubmittedAt(),
					a.getConsultationSkippedReason());
		}

	}

	public record CaseRowResponse(UUID caseId, String referenceNumber, String patientName, String specialty,
			String specialtyOther, CaseStatus caseStatus, Instant caseCreatedAt, AssignmentResponse assignment,
			String planStatus, LocalDate treatmentStartDate, LocalDate treatmentEndDate, String initialConsultation) {

		static CaseRowResponse of(DoctorCaseService.CaseRow r) {
			MedicalCase c = r.medicalCase();
			return new CaseRowResponse(c.getId(), c.getReferenceNumber(), r.patientName(), c.getSpecialty(),
					c.getSpecialtyOther(), c.getStatus(), c.getCreatedAt(), AssignmentResponse.of(r.assignment()),
					r.planStatus(), r.treatmentStartDate(), r.treatmentEndDate(), r.initialConsultation());
		}

	}

	public record PatientResponse(String fullName, LocalDate dateOfBirth, String gender, String countryOfResidence,
			String nationality, String medicalHistory, List<String> allergies, List<String> currentMedications,
			String pastSurgeries) {

		static PatientResponse of(Patient p) {
			return p == null ? null
					: new PatientResponse(p.getFullName(), p.getDateOfBirth(), p.getGender(), p.getCountryOfResidence(),
							p.getNationality(), p.getMedicalHistory(), p.getAllergies(), p.getCurrentMedications(),
							p.getPastSurgeries());
		}

	}

	public record DocumentResponse(UUID id, String documentType, String fileName, String mimeType, long fileSizeBytes,
			Instant uploadedAt) {

		static DocumentResponse of(CaseDocument d) {
			return new DocumentResponse(d.getId(), d.getDocumentType(), d.getFileName(), d.getMimeType(),
					d.getFileSizeBytes(), d.getUploadedAt());
		}

	}

	public record DocumentRequestResponse(UUID id, String documentType, String message, String status,
			Instant requestedAt, Instant receivedAt) {

		static DocumentRequestResponse of(CaseDocumentRequest r) {
			return new DocumentRequestResponse(r.getId(), r.getDocumentType(), r.getMessage(), r.getStatus(),
					r.getRequestedAt(), r.getReceivedAt());
		}

	}

	public record ConsultationLink(UUID id, String kind, String status, Instant requestedAt) {
	}

	/** @param state none, slots_proposed, slot_selected, scheduled, held or skipped */
	public record InitialConsultationResponse(String state, UUID consultationId, String skippedReason) {
	}

	public record CaseDetailResponse(UUID caseId, String referenceNumber, String specialty, String specialtyOther,
			String description, CaseStatus caseStatus, Instant caseCreatedAt, AssignmentResponse assignment,
			PatientResponse patient, List<DocumentResponse> documents, List<DocumentRequestResponse> documentRequests,
			String planStatus, LocalDate treatmentStartDate, LocalDate treatmentEndDate,
			List<ConsultationLink> consultations, InitialConsultationResponse initialConsultation) {

		static CaseDetailResponse of(DoctorCaseService.CaseDetail d) {
			MedicalCase c = d.medicalCase();
			TreatmentPlan plan = d.plan();
			return new CaseDetailResponse(c.getId(), c.getReferenceNumber(), c.getSpecialty(), c.getSpecialtyOther(),
					c.getDescription(), c.getStatus(), c.getCreatedAt(), AssignmentResponse.of(d.assignment()),
					PatientResponse.of(d.patient()), d.documents().stream().map(DocumentResponse::of).toList(),
					d.documentRequests().stream().map(DocumentRequestResponse::of).toList(),
					plan == null ? null : plan.getStatus(), plan == null ? null : plan.getTreatmentStartDate(),
					plan == null ? null : plan.getTreatmentEndDate(),
					d.consultations().stream()
						.map((ConsultationRequest r) -> new ConsultationLink(r.getId(), r.getKind(), r.getStatus(),
								r.getRequestedAt()))
						.toList(),
					d.initialConsultation() == null ? null
							: new InitialConsultationResponse(d.initialConsultation().state(),
									d.initialConsultation().consultationId(), d.initialConsultation().skippedReason()));
		}

	}

	public record SpecialistResponse(String specialistType, String specialistName, BigDecimal costAud, String notes) {
	}

	public record HospitalOption(UUID id, String name, String city, List<String> roomTypes) {
	}

	public record PlanResponse(UUID caseId, String referenceNumber, String specialty, String specialtyOther,
			CaseStatus caseStatus, Instant evaluationStartedAt, String initialConsultation, UUID planId, String status,
			Instant submittedAt,
			Instant updatedAt, String diagnosis, String treatmentType, String procedureName, String description,
			String technique, String expectedOutcome, String successRate, LocalDate treatmentStartDate,
			LocalDate treatmentEndDate, Integer treatmentDurationDays, String recoveryTime,
			String estimatedLengthOfStay, UUID hospitalId, String department, String roomCategory,
			String specialRequirements, BigDecimal doctorFeesAud, BigDecimal hospitalFeesAud,
			List<DoctorPlanService.CostItem> costItems, String costNotes, String patientInstructions,
			List<String> aftercare, List<SpecialistResponse> specialists, List<HospitalOption> hospitals) {

		static PlanResponse of(DoctorPlanService.PlanView v) {
			MedicalCase c = v.medicalCase();
			TreatmentPlan p = v.plan();
			List<HospitalOption> hospitals = v.hospitals().stream()
				.map(h -> new HospitalOption(h.getId(), h.getName(), h.getCity(),
						h.getRoomTypes() == null ? List.of() : List.of(h.getRoomTypes())))
				.toList();
			List<SpecialistResponse> people = v.specialists().stream()
				.map((TreatmentPlanSpecialist s) -> new SpecialistResponse(s.getSpecialistType(), s.getSpecialistName(),
						s.getCostAud(), s.getNotes()))
				.toList();
			if (p == null) {
				return new PlanResponse(c.getId(), c.getReferenceNumber(), c.getSpecialty(), c.getSpecialtyOther(),
						c.getStatus(), v.assignment().getEvaluationStartedAt(), v.initialConsultation(), null, null, null,
						null, null, null, null,
						null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
						List.of(), null, null, List.of(), List.of(), hospitals);
			}
			return new PlanResponse(c.getId(), c.getReferenceNumber(), c.getSpecialty(), c.getSpecialtyOther(),
					c.getStatus(), v.assignment().getEvaluationStartedAt(), v.initialConsultation(), p.getId(), p.getStatus(),
					p.getSubmittedAt(),
					p.getUpdatedAt(), p.getDiagnosis(), p.getTreatmentType(), p.getProcedureName(), p.getDescription(),
					p.getTechnique(), p.getExpectedOutcome(), p.getSuccessRate(), p.getTreatmentStartDate(),
					p.getTreatmentEndDate(), p.getTreatmentDurationDays(), p.getRecoveryTime(),
					p.getEstimatedLengthOfStay(), p.getHospitalId(), p.getDepartment(), p.getRoomCategory(),
					p.getSpecialRequirements(), p.getDoctorFeesAud(), p.getHospitalFeesAud(), v.costItems(),
					p.getCostNotes(), p.getPatientInstructions(), p.getAftercare(), people, hospitals);
		}

	}

}
