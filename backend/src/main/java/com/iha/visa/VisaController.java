package com.iha.visa;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.iha.auth.CurrentUser;
import com.iha.cases.CaseService;
import com.iha.cases.CaseStatus;
import com.iha.cases.MedicalCase;

import org.springframework.http.HttpStatus;
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
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/patient")
public class VisaController {

	private final VisaService visa;
	private final CaseService caseService;

	public VisaController(VisaService visa, CaseService caseService) {
		this.visa = visa;
		this.caseService = caseService;
	}

	@GetMapping("/cases/{caseId}/visa")
	public CaseVisaResponse forCase(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId) {
		VisaService.CaseVisa v = visa.forCase(CurrentUser.from(jwt), caseId);
		VisaSubmission s = v.submission();
		boolean canStart = v.medicalCase().getStatus() == CaseStatus.PAYMENT_CONFIRMED && v.lettersReady()
				&& (s == null || !s.isFormSubmitted());
		return new CaseVisaResponse(caseId, v.medicalCase().getReferenceNumber(), v.medicalCase().getStatus(),
				VisaService.VISA_PAGE_STATUSES.contains(v.medicalCase().getStatus()), v.lettersReady(), canStart,
				s == null ? null : SubmissionSummary.of(s, v.medicalCase()), s == null ? null : visa.formData(s),
				v.documents().stream().map(DocumentResponse::of).toList(),
				v.openRequests().stream().map(RequestResponse::of).toList());
	}

	@PostMapping("/cases/{caseId}/visa/documents")
	@ResponseStatus(HttpStatus.CREATED)
	public DocumentResponse uploadForCase(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
			@RequestParam String category, @RequestParam MultipartFile file) {
		return DocumentResponse.of(visa.uploadForCase(CurrentUser.from(jwt), caseId, category, file));
	}

	@PostMapping("/cases/{caseId}/visa")
	@ResponseStatus(HttpStatus.CREATED)
	public SubmissionSummary submit(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
			@RequestBody VisaForm form) {
		CurrentUser user = CurrentUser.from(jwt);
		VisaSubmission submission = visa.submit(user, caseId, form);
		return SubmissionSummary.of(submission, caseService.getForPatient(user, caseId));
	}

	/** The "Visa management" tab: submitted/started applications plus paid cases that can start one. */
	@GetMapping("/visa-submissions")
	public VisaOverview overview(@AuthenticationPrincipal Jwt jwt) {
		CurrentUser user = CurrentUser.from(jwt);
		List<MedicalCase> cases = caseService.listForPatient(user).stream().map(CaseService.CaseSummary::medicalCase).toList();
		Map<UUID, MedicalCase> caseById = cases.stream().collect(Collectors.toMap(MedicalCase::getId, Function.identity()));
		List<VisaSubmission> submissions = visa.submissionsFor(user);
		Map<UUID, VisaSubmission> byCase = submissions.stream()
			.collect(Collectors.toMap(VisaSubmission::getCaseId, Function.identity()));
		List<UUID> eligibleIds = cases.stream()
			.filter(c -> c.getStatus() == CaseStatus.PAYMENT_CONFIRMED)
			.filter(c -> !byCase.containsKey(c.getId()) || !byCase.get(c.getId()).isFormSubmitted())
			.map(MedicalCase::getId)
			.toList();
		Map<UUID, Boolean> letters = visa.lettersReadyByCase(eligibleIds);
		return new VisaOverview(
				submissions.stream()
					.filter(VisaSubmission::isFormSubmitted)
					.map(s -> SubmissionSummary.of(s, caseById.get(s.getCaseId())))
					.toList(),
				eligibleIds.stream()
					.map(id -> new EligibleCase(id, caseById.get(id).getReferenceNumber(), caseById.get(id).getSpecialty(),
							caseById.get(id).getSpecialtyOther(), letters.getOrDefault(id, false)))
					.toList());
	}

	@GetMapping("/visa-submissions/{submissionId}")
	public SubmissionDetailResponse detail(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID submissionId) {
		VisaService.SubmissionDetail d = visa.detail(CurrentUser.from(jwt), submissionId);
		return new SubmissionDetailResponse(SubmissionSummary.of(d.submission(), d.medicalCase()), d.form(),
				d.documents().stream().map(DocumentResponse::of).toList(),
				d.openRequests().stream().map(RequestResponse::of).toList(),
				VisaSubmission.UPLOAD_LOCKED.contains(d.submission().getStatus()));
	}

	@PostMapping("/visa-submissions/{submissionId}/documents")
	@ResponseStatus(HttpStatus.CREATED)
	public DocumentResponse uploadForSubmission(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID submissionId,
			@RequestParam String category, @RequestParam MultipartFile file) {
		return DocumentResponse.of(visa.uploadForSubmission(CurrentUser.from(jwt), submissionId, category, file));
	}

	public record CaseVisaResponse(UUID caseId, String referenceNumber, CaseStatus caseStatus, boolean visaPageOpen,
			boolean lettersReady, boolean canStart, SubmissionSummary submission, VisaForm form,
			List<DocumentResponse> documents, List<RequestResponse> openRequests) {
	}

	public record SubmissionSummary(UUID id, UUID caseId, String caseReference, String specialty,
			String specialtyOther, CaseStatus caseStatus, String status, String rejectionReason, boolean formSubmitted,
			Instant createdAt, Instant updatedAt) {

		static SubmissionSummary of(VisaSubmission s, MedicalCase c) {
			return new SubmissionSummary(s.getId(), s.getCaseId(), c == null ? null : c.getReferenceNumber(),
					c == null ? null : c.getSpecialty(), c == null ? null : c.getSpecialtyOther(),
					c == null ? null : c.getStatus(), s.getStatus(), s.getRejectionReason(), s.isFormSubmitted(),
					s.getCreatedAt(), s.getUpdatedAt());
		}

	}

	public record SubmissionDetailResponse(SubmissionSummary submission, VisaForm form, List<DocumentResponse> documents,
			List<RequestResponse> openRequests, boolean uploadsLocked) {
	}

	public record VisaOverview(List<SubmissionSummary> submissions, List<EligibleCase> eligibleCases) {
	}

	public record EligibleCase(UUID caseId, String referenceNumber, String specialty, String specialtyOther,
			boolean lettersReady) {
	}

	public record DocumentResponse(UUID id, UUID caseId, String category, String source, String fileName,
			String mimeType, Long fileSizeBytes, boolean requestedByLawyer, String reviewStatus, Instant sentToPatientAt,
			Instant uploadedAt) {

		public static DocumentResponse of(VisaDocument d) {
			return new DocumentResponse(d.getId(), d.getCaseId(), d.getCategory(), d.getSource(), d.getFileName(),
					d.getMimeType(), d.getFileSizeBytes(), d.isRequestedByLawyer(), d.getReviewStatus(),
					d.getSentToPatientAt(), d.getUploadedAt());
		}

	}

	public record RequestResponse(UUID id, String category, String instructions, Instant createdAt) {

		static RequestResponse of(VisaDocumentRequest r) {
			return new RequestResponse(r.getId(), r.getCategory(), r.getInstructions(), r.getCreatedAt());
		}

	}

}
