package com.iha.doctor;

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

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** The doctor's support chat with MTA (same shape as the patient chat API). */
@RestController
@RequestMapping("/api/doctor/messages")
public class DoctorMessageController {

	private final DoctorAccountService accounts;
	private final ProviderMessageService messages;

	DoctorMessageController(DoctorAccountService accounts, ProviderMessageService messages) {
		this.accounts = accounts;
		this.messages = messages;
	}

	@GetMapping
	public ThreadResponse thread(@AuthenticationPrincipal Jwt jwt) {
		ProviderMessageService.ThreadView view = messages.thread(account(jwt));
		ProviderMessageThread t = view.thread();
		return new ThreadResponse(t.getId(), t.getStatus(), t.getOpenedAt(), t.getClosedAt(), t.getReopenRequestedAt(),
				view.unread(), view.messages().stream().map(ProviderMessageService.MessageView::of).toList());
	}

	@GetMapping("/unread-count")
	public UnreadCount unread(@AuthenticationPrincipal Jwt jwt) {
		return new UnreadCount(messages.unread(account(jwt)));
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public ProviderMessageService.MessageView send(@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody SendMessageRequest request) {
		return ProviderMessageService.MessageView.of(
				messages.send(account(jwt), CurrentUser.from(jwt).email(), request.body()));
	}

	@PostMapping("/read")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void markRead(@AuthenticationPrincipal Jwt jwt) {
		messages.markAdminMessagesRead(account(jwt));
	}

	@PostMapping("/reopen-request")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void requestReopen(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ReopenRequest request) {
		messages.requestReopen(account(jwt), CurrentUser.from(jwt).email(), request.reason());
	}

	private ProviderAccount account(Jwt jwt) {
		return accounts.account(accounts.requireActive(CurrentUser.from(jwt)));
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
