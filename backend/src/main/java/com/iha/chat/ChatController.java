package com.iha.chat;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.iha.auth.CurrentUser;
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

@RestController
@RequestMapping("/api/patient/chat")
public class ChatController {

	private final ChatService chatService;

	public ChatController(ChatService chatService) {
		this.chatService = chatService;
	}

	@GetMapping
	public ThreadResponse thread(@AuthenticationPrincipal Jwt jwt) {
		ChatService.ThreadView view = chatService.threadForPatient(CurrentUser.from(jwt));
		ChatThread t = view.thread();
		return new ThreadResponse(t.getId(), t.getStatus(), t.getOpenedAt(), t.getClosedAt(), t.getReopenRequestedAt(),
				view.unread(), view.messages().stream().map(MessageResponse::of).toList());
	}

	@GetMapping("/unread-count")
	public UnreadCount unread(@AuthenticationPrincipal Jwt jwt) {
		return new UnreadCount(chatService.unreadForPatient(CurrentUser.from(jwt)));
	}

	@PostMapping("/messages")
	@ResponseStatus(HttpStatus.CREATED)
	public MessageResponse send(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SendMessageRequest request) {
		return MessageResponse.of(chatService.sendAsPatient(CurrentUser.from(jwt), request.body()));
	}

	@PostMapping("/read")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void markRead(@AuthenticationPrincipal Jwt jwt) {
		chatService.markAdminMessagesRead(CurrentUser.from(jwt));
	}

	@PostMapping("/reopen-request")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void requestReopen(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ReopenRequest request) {
		chatService.requestReopen(CurrentUser.from(jwt), request.reason());
	}

	public record SendMessageRequest(@NotBlank @Size(max = 5000) String body) {
	}

	public record ReopenRequest(
			@NotBlank @Size(min = 10, max = 500, message = "Please describe your reason in 10–500 characters") String reason) {
	}

	public record UnreadCount(long count) {
	}

	public record ThreadResponse(UUID id, String status, Instant openedAt, Instant closedAt,
			Instant reopenRequestedAt, long unread, List<MessageResponse> messages) {
	}

	public record MessageResponse(UUID id, String senderType, String body, boolean read, Instant createdAt) {

		static MessageResponse of(ChatMessage m) {
			return new MessageResponse(m.getId(), m.getSenderType(), m.getBody(), m.isRead(), m.getCreatedAt());
		}

	}

}
