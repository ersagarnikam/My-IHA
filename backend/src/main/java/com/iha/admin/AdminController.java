package com.iha.admin;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import com.iha.auth.CurrentUser;
import com.iha.common.AustralianTimeZones;
import com.iha.cases.CaseService;
import com.iha.cases.CaseStatus;
import com.iha.cases.MedicalCase;
import com.iha.doctor.DoctorAccountService;
import com.iha.doctor.DoctorAdminService;
import com.iha.hospital.HospitalAdminService;
import com.iha.documents.PatientDocumentController;
import com.iha.patient.Patient;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorCaseAssignment;
import com.iha.provider.Hospital;
import com.iha.treatment.TreatmentPlan;
import com.iha.lawyer.LawyerAdminService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** MTA admin: overview, doctor approvals, cases and doctor assignment, treatment plan review. */
@RestController
@RequestMapping("/api/admin")
public class AdminController {

	private final AdminService admin;
	private final DoctorAdminService doctorAdmin;
	private final DoctorAccountService doctorAccounts;
	private final AdminInsightsService insights;
	private final HospitalAdminService hospitalAdmin;
	private final LawyerAdminService lawyerAdmin;

	AdminController(AdminService admin, DoctorAdminService doctorAdmin, DoctorAccountService doctorAccounts,
			AdminInsightsService insights, HospitalAdminService hospitalAdmin, LawyerAdminService lawyerAdmin) {
		this.lawyerAdmin = lawyerAdmin;
		this.admin = admin;
		this.doctorAdmin = doctorAdmin;
		this.doctorAccounts = doctorAccounts;
		this.insights = insights;
		this.hospitalAdmin = hospitalAdmin;
	}

	@GetMapping("/overview")
	public OverviewResponse overview() {
		AdminService.Overview o = admin.overview();
		return new OverviewResponse(o.pendingDoctors(), hospitalAdmin.pendingCount(), lawyerAdmin.pendingCount(),
				lawyerAdmin.unassignedCount(), o.casesNeedingDoctor(),
				o.plansToReview(), o.chatsWaiting(),
				o.totalCases(), o.recentCases().stream().map(CaseRowResponse::of).toList());
	}

	/** Dashboard figures: money, pipeline, doctor performance, coverage, what needs a nudge. */
	@GetMapping("/insights")
	public AdminInsightsService.Insights insights() {
		return insights.insights();
	}

	// ── Doctors ─────────────────────────────────────────────────────────────

	@GetMapping("/doctors")
	public List<DoctorRowResponse> doctors() {
		return admin.doctors().stream().map(DoctorRowResponse::of).toList();
	}

	@GetMapping("/doctors/{doctorId}")
	public DoctorDetailResponse doctor(@PathVariable UUID doctorId) {
		Doctor d = admin.doctor(doctorId);
		List<DoctorAccountService.RegistrationDocument> docs = doctorAccounts.documents(d);
		return new DoctorDetailResponse(DoctorRowResponse.of(d), d.getContactPhone(), d.getQualifications(),
				d.getYearsExperience(), d.getLicenseNumber(), d.getBio(), list(d.getLanguagesSpoken()),
				d.getDepartment(), d.getRole(), list(d.getWorkingDays()), d.getRejectionReason(),
				d.getMoreInfoMessage(), d.getIndemnity(),
				Doctor.Indemnity.status(d.getIndemnity(), LocalDate.now(AustralianTimeZones.zone(d.getTimeZone()))),
				admin.hospitalsById(doctorAccounts.hospitalIds(d)).stream().map(Hospital::getName).sorted().toList(),
				IntStream.range(0, docs.size())
					.mapToObj(i -> new DocumentResponse(i, docs.get(i).fileName(), docs.get(i).category(),
							docs.get(i).mimeType(), docs.get(i).fileSizeBytes()))
					.toList());
	}

	/** Workload, responsiveness, plan outcomes, earnings and the doctor's cases. */
	@GetMapping("/doctors/{doctorId}/performance")
	public AdminInsightsService.DoctorPerformance doctorPerformance(@PathVariable UUID doctorId) {
		return insights.doctorPerformance(doctorId);
	}

	@GetMapping("/doctors/{doctorId}/documents/{index}")
	public ResponseEntity<Resource> doctorDocument(@PathVariable UUID doctorId, @PathVariable int index,
			@RequestParam(defaultValue = "false") boolean download) {
		Doctor d = admin.doctor(doctorId);
		DoctorAccountService.RegistrationDocument doc = doctorAccounts.documents(d).get(checkIndex(d, index));
		return PatientDocumentController.file(doctorAccounts.loadDocument(d, index), doc.mimeType(), doc.fileName(),
				download);
	}

	/** {@code outcome}: approved, rejected or more_info_requested (reason required for the last two). */
	@PostMapping("/doctors/{doctorId}/review")
	public DoctorRowResponse review(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID doctorId,
			@Valid @RequestBody ReviewRequest request) {
		if (!Doctor.APPROVED.equals(request.outcome()) && (request.reason() == null || request.reason().isBlank())) {
			throw com.iha.common.ApiException.badRequest("reason_required", "Tell the doctor what to change or why.");
		}
		return DoctorRowResponse.of(doctorAdmin.review(CurrentUser.from(jwt), doctorId, request.outcome(),
				request.reason() == null ? null : request.reason().trim()));
	}

	// ── Cases ───────────────────────────────────────────────────────────────

	@GetMapping("/cases")
	public List<CaseRowResponse> cases() {
		return admin.cases().stream().map(CaseRowResponse::of).toList();
	}

	@GetMapping("/cases/{caseId}")
	public CaseDetailResponse caseDetail(@PathVariable UUID caseId) {
		return CaseDetailResponse.of(admin.caseDetail(caseId));
	}

	@GetMapping("/cases/{caseId}/documents/{documentId}/content")
	public ResponseEntity<Resource> caseDocument(@PathVariable UUID caseId, @PathVariable UUID documentId,
			@RequestParam(defaultValue = "false") boolean download) {
		CaseService.StoredDocument stored = admin.caseDocument(caseId, documentId);
		return PatientDocumentController.file(stored.content(), stored.document().getMimeType(),
				stored.document().getFileName(), download);
	}

	@GetMapping("/cases/{caseId}/candidates")
	public List<CandidateResponse> candidates(@PathVariable UUID caseId) {
		return admin.candidates(caseId).stream()
			.map(c -> new CandidateResponse(c.doctor().getId(), c.doctor().getFullName(), list(c.doctor().getSpecialties()),
					c.doctor().getYearsExperience(), c.matchesSpecialty()))
			.toList();
	}

	@PostMapping("/cases/{caseId}/assignments")
	@ResponseStatus(HttpStatus.CREATED)
	public CaseDetailResponse assign(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
			@Valid @RequestBody AssignRequest request) {
		doctorAdmin.assignCase(CurrentUser.from(jwt), caseId, request.doctorId());
		return CaseDetailResponse.of(admin.caseDetail(caseId));
	}

	// ── Treatment plans ─────────────────────────────────────────────────────

	/** {@code status} defaults to everything that has been submitted. */
	@GetMapping("/plans")
	public List<PlanRowResponse> plans(@RequestParam(required = false) String status) {
		return admin.plans(status).stream().map(PlanRowResponse::of).toList();
	}

	@GetMapping("/plans/{planId}")
	public PlanDetailResponse plan(@PathVariable UUID planId) {
		return PlanDetailResponse.of(admin.plan(planId));
	}

	@PostMapping("/plans/{planId}/publish")
	public PlanDetailResponse publish(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID planId,
			@Valid @RequestBody PublishRequest request) {
		doctorAdmin.publishPlan(CurrentUser.from(jwt), planId, request.mtaCommissionAud());
		return PlanDetailResponse.of(admin.plan(planId));
	}

	@PostMapping("/plans/{planId}/reject")
	public PlanDetailResponse reject(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID planId,
			@Valid @RequestBody RejectRequest request) {
		doctorAdmin.rejectPlan(CurrentUser.from(jwt), planId, request.reason());
		return PlanDetailResponse.of(admin.plan(planId));
	}

	// ── Shapes ──────────────────────────────────────────────────────────────

	private int checkIndex(Doctor d, int index) {
		if (index < 0 || index >= doctorAccounts.documents(d).size()) {
			throw com.iha.common.ApiException.notFound("Document not found.");
		}
		return index;
	}

	static List<String> list(String[] values) {
		return values == null ? List.of() : Arrays.asList(values);
	}

	public record ReviewRequest(@NotBlank String outcome, @Size(max = 1000) String reason) {
	}

	public record AssignRequest(@NotNull UUID doctorId) {
	}

	public record PublishRequest(@NotNull BigDecimal mtaCommissionAud) {
	}

	public record RejectRequest(@NotBlank @Size(max = 1000) String reason) {
	}

	public record OverviewResponse(long pendingDoctors, long pendingHospitals, long pendingLawyers,
			long visaCasesUnassigned, long casesNeedingDoctor, long plansToReview,
			long chatsWaiting, long totalCases, List<CaseRowResponse> recentCases) {
	}

	public record DoctorRowResponse(UUID id, String fullName, String email, List<String> specialties, String status,
			Instant createdAt, Instant registrationFeePaidAt, boolean active) {

		static DoctorRowResponse of(Doctor d) {
			return new DoctorRowResponse(d.getId(), d.getFullName(), d.getContactEmail(), list(d.getSpecialties()),
					d.getStatus(), d.getCreatedAt(), d.getRegistrationFeePaidAt(), d.isActive());
		}

	}

	public record DocumentResponse(int index, String fileName, String category, String mimeType, long fileSizeBytes) {
	}

	public record DoctorDetailResponse(DoctorRowResponse doctor, String contactPhone, String qualifications,
			Integer yearsOfExperience, String licenseNumber, String bio, List<String> languagesSpoken,
			String department, String role, List<String> workingDays, String rejectionReason, String moreInfoMessage,
			Doctor.Indemnity indemnity, String indemnityStatus, List<String> hospitals, List<DocumentResponse> documents) {
	}

	public record CaseRowResponse(UUID id, String referenceNumber, String patientName, String specialty,
			String specialtyOther, CaseStatus status, Instant createdAt, List<String> doctorNames, boolean needsDoctor) {

		static CaseRowResponse of(AdminService.CaseRow r) {
			MedicalCase c = r.medicalCase();
			return new CaseRowResponse(c.getId(), c.getReferenceNumber(), r.patientName(), c.getSpecialty(),
					c.getSpecialtyOther(), c.getStatus(), c.getCreatedAt(), r.doctorNames(), r.needsDoctor());
		}

	}

	public record PatientSummary(String fullName, LocalDate dateOfBirth, String gender, String nationality,
			String countryOfResidence, String phone) {
	}

	public record CaseDocumentResponse(UUID id, String documentType, String fileName, String mimeType,
			long fileSizeBytes, Instant uploadedAt) {
	}

	public record AssignmentResponse(UUID id, UUID doctorId, String doctorName, String status, String declineReason,
			Instant invitedAt, Instant respondedAt, Instant evaluationStartedAt, Instant planSubmittedAt,
			String consultationSkippedReason, UUID planId, String planStatus) {
	}

	public record CaseDetailResponse(UUID id, String referenceNumber, String specialty, String specialtyOther,
			String description, CaseStatus status, Instant createdAt, PatientSummary patient,
			List<CaseDocumentResponse> documents, List<AssignmentResponse> assignments) {

		static CaseDetailResponse of(AdminService.CaseDetail d) {
			MedicalCase c = d.medicalCase();
			Patient p = d.patient();
			return new CaseDetailResponse(c.getId(), c.getReferenceNumber(), c.getSpecialty(), c.getSpecialtyOther(),
					c.getDescription(), c.getStatus(), c.getCreatedAt(),
					p == null ? null
							: new PatientSummary(p.getFullName(), p.getDateOfBirth(), p.getGender(), p.getNationality(),
									p.getCountryOfResidence(), p.getPhone()),
					d.documents().stream()
						.map(x -> new CaseDocumentResponse(x.getId(), x.getDocumentType(), x.getFileName(), x.getMimeType(),
								x.getFileSizeBytes(), x.getUploadedAt()))
						.toList(),
					d.assignments().stream().map(r -> {
						DoctorCaseAssignment a = r.assignment();
						return new AssignmentResponse(a.getId(), a.getDoctorId(),
								r.doctor() == null ? null : r.doctor().getFullName(), a.getStatus(), a.getDeclineReason(),
								a.getInvitedAt(), a.getRespondedAt(), a.getEvaluationStartedAt(), a.getPlanSubmittedAt(),
								a.getConsultationSkippedReason(), r.plan() == null ? null : r.plan().getId(),
								r.plan() == null ? null : r.plan().getStatus());
					}).toList());
		}

	}

	public record CandidateResponse(UUID id, String fullName, List<String> specialties, Integer yearsOfExperience,
			boolean matchesSpecialty) {
	}

	public record PlanRowResponse(UUID id, String status, UUID caseId, String referenceNumber, String specialty,
			String doctorName, String hospitalName, String procedureName, Instant submittedAt, BigDecimal totalAud) {

		static PlanRowResponse of(AdminService.PlanRow r) {
			TreatmentPlan p = r.plan();
			return new PlanRowResponse(p.getId(), p.getStatus(), p.getCaseId(),
					r.medicalCase() == null ? null : r.medicalCase().getReferenceNumber(),
					r.medicalCase() == null ? null : r.medicalCase().getSpecialty(),
					r.doctor() == null ? null : r.doctor().getFullName(), r.hospital() == null ? null : r.hospital().getName(),
					p.getProcedureName(), p.getSubmittedAt(), r.totalAud());
		}

	}

	public record SpecialistResponse(String specialistType, String specialistName, BigDecimal costAud, String notes) {
	}

	public record PlanDetailResponse(UUID id, String status, String rejectionReason, Instant submittedAt, UUID caseId,
			String referenceNumber, String specialty, String doctorName, String hospitalName, String hospitalCity,
			String diagnosis, String treatmentType, String procedureName, String description, String technique,
			String expectedOutcome, String successRate, LocalDate treatmentStartDate, LocalDate treatmentEndDate,
			Integer treatmentDurationDays, String recoveryTime, String estimatedLengthOfStay, String department,
			String roomCategory, String specialRequirements, BigDecimal doctorFeesAud, BigDecimal hospitalFeesAud,
			List<AdminService.CostItem> costItems, String costNotes, List<SpecialistResponse> specialists,
			String patientInstructions, List<String> aftercare, BigDecimal totalAud,
			BigDecimal suggestedCommissionAud) {

		static PlanDetailResponse of(AdminService.PlanDetail d) {
			TreatmentPlan p = d.plan();
			return new PlanDetailResponse(p.getId(), p.getStatus(), p.getRejectionReason(), p.getSubmittedAt(),
					p.getCaseId(), d.medicalCase() == null ? null : d.medicalCase().getReferenceNumber(),
					d.medicalCase() == null ? null : d.medicalCase().getSpecialty(),
					d.doctor() == null ? null : d.doctor().getFullName(), d.hospital() == null ? null : d.hospital().getName(),
					d.hospital() == null ? null : d.hospital().getCity(), p.getDiagnosis(), p.getTreatmentType(),
					p.getProcedureName(), p.getDescription(), p.getTechnique(), p.getExpectedOutcome(), p.getSuccessRate(),
					p.getTreatmentStartDate(), p.getTreatmentEndDate(), p.getTreatmentDurationDays(), p.getRecoveryTime(),
					p.getEstimatedLengthOfStay(), p.getDepartment(), p.getRoomCategory(), p.getSpecialRequirements(),
					p.getDoctorFeesAud(), p.getHospitalFeesAud(), d.costItems(), p.getCostNotes(),
					d.specialists().stream()
						.map(s -> new SpecialistResponse(s.getSpecialistType(), s.getSpecialistName(), s.getCostAud(),
								s.getNotes()))
						.toList(),
					p.getPatientInstructions(), p.getAftercare(), d.totalAud(), d.suggestedCommissionAud());
		}

	}

}
