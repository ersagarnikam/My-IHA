package com.iha.admin;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import com.iha.auth.CurrentUser;
import com.iha.common.ApiException;
import com.iha.documents.PatientDocumentController;
import com.iha.lawyer.LawyerAccountService;
import com.iha.lawyer.LawyerAdminService;
import com.iha.provider.Lawyer;
import com.iha.visa.VisaSubmission;
import com.iha.visa.VisaSubmissionRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** MTA admin: visa lawyer registrations and assigning submitted visa applications. */
@RestController
@RequestMapping("/api/admin")
public class AdminLawyerController {

	private final LawyerAdminService lawyers;
	private final LawyerAccountService accounts;
	private final VisaSubmissionRepository submissions;

	AdminLawyerController(LawyerAdminService lawyers, LawyerAccountService accounts,
			VisaSubmissionRepository submissions) {
		this.lawyers = lawyers;
		this.accounts = accounts;
		this.submissions = submissions;
	}

	@GetMapping("/lawyers")
	public List<LawyerRow> list() {
		return lawyers.registered().stream().map(this::row).toList();
	}

	@GetMapping("/lawyers/{lawyerId}")
	public LawyerDetail detail(@PathVariable UUID lawyerId) {
		Lawyer l = lawyers.lawyer(lawyerId);
		List<LawyerAccountService.RegistrationDocument> docs = accounts.documents(l);
		return new LawyerDetail(row(l), l.getAbnNumber(), l.getPhone(), l.getAddress(), l.getZipCode(),
				l.getExperience(), l.getCredentialNumber(), l.getPractisingState(), l.getCredentialExpiresOn(),
				l.getRejectionReason(), l.getMoreInfoMessage(),
				IntStream.range(0, docs.size())
					.mapToObj(i -> new DocumentResponse(i, docs.get(i).fileName(), docs.get(i).category(),
							docs.get(i).mimeType(), docs.get(i).fileSizeBytes()))
					.toList());
	}

	@GetMapping("/lawyers/{lawyerId}/documents/{index}")
	public ResponseEntity<Resource> document(@PathVariable UUID lawyerId, @PathVariable int index,
			@RequestParam(defaultValue = "false") boolean download) {
		Lawyer l = lawyers.lawyer(lawyerId);
		List<LawyerAccountService.RegistrationDocument> docs = accounts.documents(l);
		if (index < 0 || index >= docs.size()) {
			throw ApiException.notFound("Document not found.");
		}
		LawyerAccountService.RegistrationDocument doc = docs.get(index);
		return PatientDocumentController.file(accounts.loadDocument(l, index), doc.mimeType(), doc.fileName(),
				download);
	}

	/** {@code outcome}: approved, rejected or more_info_requested (reason required for the last two). */
	@PostMapping("/lawyers/{lawyerId}/review")
	public LawyerRow review(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID lawyerId,
			@Valid @RequestBody ReviewRequest request) {
		if (!Lawyer.APPROVED.equals(request.outcome()) && (request.reason() == null || request.reason().isBlank())) {
			throw ApiException.badRequest("reason_required", "Tell the lawyer what to change or why.");
		}
		return row(lawyers.review(CurrentUser.from(jwt), lawyerId, request.outcome(),
				request.reason() == null ? null : request.reason().trim()));
	}

	@GetMapping("/visa-cases")
	public List<LawyerAdminService.VisaCase> visaCases() {
		return lawyers.visaCases();
	}

	@PostMapping("/visa-cases/{caseId}/lawyer")
	public List<LawyerAdminService.VisaCase> assign(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
			@Valid @RequestBody AssignRequest request) {
		lawyers.assign(CurrentUser.from(jwt), caseId, request.lawyerId());
		return lawyers.visaCases();
	}

	private LawyerRow row(Lawyer l) {
		long active = submissions.findByAssignedLawyerIdOrderByUpdatedAtDesc(l.getId())
			.stream()
			.filter(s -> !VisaSubmission.APPROVED.equals(s.getStatus()) && !VisaSubmission.REJECTED.equals(s.getStatus()))
			.count();
		return new LawyerRow(l.getId(), l.getName(), l.getContactEmail(), l.getLawyerType(), l.getCity(),
				l.getCredentialType(), l.getStatus(), l.getCreatedAt(), active);
	}

	public record ReviewRequest(@NotBlank String outcome, @Size(max = 1000) String reason) {
	}

	public record AssignRequest(@NotNull UUID lawyerId) {
	}

	public record LawyerRow(UUID id, String name, String email, String lawyerType, String city, String credentialType,
			String status, Instant createdAt, long activeCases) {
	}

	public record DocumentResponse(int index, String fileName, String category, String mimeType, long fileSizeBytes) {
	}

	public record LawyerDetail(LawyerRow lawyer, String abnNumber, String phone, String address, String zipCode,
			String experience, String credentialNumber, String practisingState, LocalDate credentialExpiresOn,
			String rejectionReason, String moreInfoMessage, List<DocumentResponse> documents) {
	}

}
