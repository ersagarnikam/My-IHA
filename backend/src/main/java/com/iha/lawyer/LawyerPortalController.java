package com.iha.lawyer;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.iha.auth.CurrentUser;
import com.iha.documents.PatientDocumentController;
import com.iha.providerchat.ProviderAccount;
import com.iha.providerchat.ProviderMessageService;
import com.iha.providerchat.ProviderMessageThread;
import com.iha.visa.VisaService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.core.io.Resource;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RequestPart;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** The approved lawyer's portal: dashboard, visa cases, approved visas and the chat with MTA. */
@RestController
@RequestMapping("/api/lawyer")
public class LawyerPortalController {

	private final LawyerAccountService accounts;
	private final LawyerCaseService cases;
	private final ProviderMessageService messages;

	LawyerPortalController(LawyerAccountService accounts, LawyerCaseService cases, ProviderMessageService messages) {
		this.accounts = accounts;
		this.cases = cases;
		this.messages = messages;
	}

	@GetMapping("/dashboard")
	public LawyerCaseService.Dashboard dashboard(@AuthenticationPrincipal Jwt jwt) {
		return cases.dashboard(CurrentUser.from(jwt));
	}

	@GetMapping("/cases")
	public List<LawyerCaseService.CaseRow> cases(@AuthenticationPrincipal Jwt jwt) {
		return cases.cases(CurrentUser.from(jwt));
	}

	@GetMapping("/cases/{caseId}")
	public LawyerCaseService.CaseDetail caseDetail(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId) {
		return cases.detail(CurrentUser.from(jwt), caseId);
	}

	/** {@code status}: one of the case's {@code nextStatuses}; {@code rejectionReason} required for rejected. */
	@PostMapping("/cases/{caseId}/status")
	public LawyerCaseService.CaseDetail updateStatus(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
			@Valid @RequestBody StatusRequest request) {
		return cases.updateStatus(CurrentUser.from(jwt), caseId, request.status(), request.rejectionReason());
	}

	@PostMapping("/cases/{caseId}/document-requests")
	@ResponseStatus(HttpStatus.CREATED)
	public LawyerCaseService.CaseDetail requestDocument(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
			@Valid @RequestBody DocumentRequest request) {
		return cases.requestDocument(CurrentUser.from(jwt), caseId, request.category(), request.documentType(),
				request.instructions());
	}

	@PostMapping("/cases/{caseId}/notes")
	@ResponseStatus(HttpStatus.CREATED)
	public LawyerCaseService.NoteView addNote(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
			@RequestBody NoteRequest request) {
		return cases.addNote(CurrentUser.from(jwt), caseId, request.body());
	}

	@GetMapping("/cases/{caseId}/documents/{documentId}")
	public ResponseEntity<Resource> document(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
			@PathVariable UUID documentId, @RequestParam(defaultValue = "false") boolean download) {
		VisaService.Stored file = cases.openDocument(CurrentUser.from(jwt), caseId, documentId);
		return PatientDocumentController.file(file.content(), file.document().getMimeType(),
				file.document().getFileName(), download);
	}

	@PostMapping(path = "/cases/{caseId}/approved-visa", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	public LawyerCaseService.DocView uploadApprovedVisa(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
			@RequestPart("file") MultipartFile file) {
		return cases.uploadApprovedVisa(CurrentUser.from(jwt), caseId, file);
	}

	@GetMapping("/approved-visas")
	public List<LawyerCaseService.ApprovedRow> approved(@AuthenticationPrincipal Jwt jwt) {
		return cases.approved(CurrentUser.from(jwt));
	}

	// ── Support chat with MTA (same shape as the doctor and hospital chat APIs) ──

	@GetMapping("/messages")
	public ThreadResponse thread(@AuthenticationPrincipal Jwt jwt) {
		ProviderMessageService.ThreadView view = messages.thread(account(jwt));
		ProviderMessageThread t = view.thread();
		return new ThreadResponse(t.getId(), t.getStatus(), t.getOpenedAt(), t.getClosedAt(), t.getReopenRequestedAt(),
				view.unread(), view.messages().stream().map(ProviderMessageService.MessageView::of).toList());
	}

	@GetMapping("/messages/unread-count")
	public UnreadCount unread(@AuthenticationPrincipal Jwt jwt) {
		return new UnreadCount(messages.unread(account(jwt)));
	}

	@PostMapping("/messages")
	@ResponseStatus(HttpStatus.CREATED)
	public ProviderMessageService.MessageView send(@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody SendMessageRequest request) {
		return ProviderMessageService.MessageView.of(
				messages.send(account(jwt), CurrentUser.from(jwt).email(), request.body()));
	}

	@PostMapping("/messages/read")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void markRead(@AuthenticationPrincipal Jwt jwt) {
		messages.markAdminMessagesRead(account(jwt));
	}

	@PostMapping("/messages/reopen-request")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void requestReopen(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ReopenRequest request) {
		messages.requestReopen(account(jwt), CurrentUser.from(jwt).email(), request.reason());
	}

	private ProviderAccount account(Jwt jwt) {
		return accounts.account(accounts.requireApproved(CurrentUser.from(jwt)));
	}

	public record StatusRequest(@NotBlank String status, @Size(max = 2000) String rejectionReason) {
	}

	public record DocumentRequest(@NotBlank(message = "Choose a document") String category,
			@NotBlank(message = "Describe the document you need") @Size(max = 200) String documentType,
			@Size(max = 1000) String instructions) {
	}

	public record NoteRequest(String body) {
	}

	public record SendMessageRequest(@NotBlank @Size(max = 5000) String body) {
	}

	public record ReopenRequest(
			@NotBlank @Size(min = 10, max = 500, message = "Please describe your reason in 10–500 characters") String reason) {
	}

	public record UnreadCount(long count) {
	}

	public record ThreadResponse(UUID id, String status, Instant openedAt, Instant closedAt,
			Instant reopenRequestedAt, long unread, List<ProviderMessageService.MessageView> messages) {
	}

}
