package com.iha.hospital;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.iha.auth.CurrentUser;
import com.iha.providerchat.ProviderAccount;
import com.iha.providerchat.ProviderMessageService;
import com.iha.providerchat.ProviderMessageThread;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.core.io.Resource;
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

/** The approved hospital's portal: dashboard, cases, patients, doctors, visa letters and the MTA chat. */
@RestController
@RequestMapping("/api/hospital")
public class HospitalPortalController {

	private final HospitalPortalService portal;
	private final HospitalAccountService accounts;
	private final ProviderMessageService messages;

	HospitalPortalController(HospitalPortalService portal, HospitalAccountService accounts,
			ProviderMessageService messages) {
		this.portal = portal;
		this.accounts = accounts;
		this.messages = messages;
	}

	@GetMapping("/dashboard")
	public HospitalPortalService.Dashboard dashboard(@AuthenticationPrincipal Jwt jwt) {
		return portal.dashboard(CurrentUser.from(jwt));
	}

	@GetMapping("/cases")
	public List<HospitalPortalService.CaseRow> cases(@AuthenticationPrincipal Jwt jwt) {
		return portal.cases(CurrentUser.from(jwt));
	}

	@GetMapping("/cases/{planId}")
	public HospitalPortalService.CaseDetail caseDetail(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID planId) {
		return portal.caseDetail(CurrentUser.from(jwt), planId);
	}

	@GetMapping("/patients")
	public List<HospitalPortalService.PatientRow> patients(@AuthenticationPrincipal Jwt jwt) {
		return portal.patients(CurrentUser.from(jwt));
	}

	@GetMapping("/patients/{patientId}")
	public HospitalPortalService.PatientDetail patient(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID patientId) {
		return portal.patient(CurrentUser.from(jwt), patientId);
	}

	@GetMapping("/doctors")
	public List<HospitalPortalService.DoctorRow> doctors(@AuthenticationPrincipal Jwt jwt) {
		return portal.doctors(CurrentUser.from(jwt));
	}

	@GetMapping("/doctors/{doctorId}")
	public HospitalPortalService.DoctorDetail doctor(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID doctorId) {
		return portal.doctor(CurrentUser.from(jwt), doctorId);
	}

	// ── Visa letters ────────────────────────────────────────────────────────

	@GetMapping("/letters")
	public List<HospitalPortalService.CaseRow> letterCases(@AuthenticationPrincipal Jwt jwt) {
		return portal.letterCases(CurrentUser.from(jwt));
	}

	/** {@code type}: hospital_invitation or appointment_confirmation. Regenerating replaces the file. */
	@PostMapping("/cases/{planId}/letters/{type}")
	public HospitalPortalService.LetterView generate(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID planId,
			@PathVariable String type) {
		return portal.generate(CurrentUser.from(jwt), planId, type);
	}

	@PostMapping("/cases/{planId}/letters/{type}/send")
	public HospitalPortalService.LetterView send(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID planId,
			@PathVariable String type) {
		return portal.send(CurrentUser.from(jwt), planId, type);
	}

	@GetMapping("/cases/{planId}/letters/{type}")
	public ResponseEntity<Resource> letter(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID planId,
			@PathVariable String type, @RequestParam(defaultValue = "false") boolean download) {
		HospitalPortalService.LetterFile file = portal.letterFile(CurrentUser.from(jwt), planId, type);
		ContentDisposition disposition = (download ? ContentDisposition.attachment() : ContentDisposition.inline())
			.filename(file.fileName())
			.build();
		return ResponseEntity.ok()
			.contentType(MediaType.APPLICATION_PDF)
			.header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
			.header(HttpHeaders.CACHE_CONTROL, "private, no-store")
			.body(file.content());
	}

	// ── Support chat with MTA (same shape as the doctor chat API) ───────────

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
