package com.iha.notification;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.iha.auth.CurrentUser;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Notifications are per account, so these endpoints serve every role. */
@RestController
@RequestMapping("/api/notifications")
public class NotificationController {

	private final NotificationService notificationService;

	public NotificationController(NotificationService notificationService) {
		this.notificationService = notificationService;
	}

	@GetMapping
	public List<NotificationResponse> list(@AuthenticationPrincipal Jwt jwt,
			@RequestParam(defaultValue = "50") int limit) {
		return notificationService.recentFor(CurrentUser.from(jwt).id(), Math.max(1, Math.min(limit, 200))).stream()
			.map(NotificationResponse::of)
			.toList();
	}

	@GetMapping("/unread-count")
	public UnreadCount unreadCount(@AuthenticationPrincipal Jwt jwt) {
		return new UnreadCount(notificationService.unreadCount(CurrentUser.from(jwt).id()));
	}

	@PostMapping("/{id}/read")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void markRead(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID id) {
		notificationService.markRead(CurrentUser.from(jwt).id(), id);
	}

	@PostMapping("/read-all")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void markAllRead(@AuthenticationPrincipal Jwt jwt) {
		notificationService.markAllRead(CurrentUser.from(jwt).id());
	}

	public record UnreadCount(long count) {
	}

	public record NotificationResponse(UUID id, UUID caseId, String type, String title, String message, boolean read,
			Instant createdAt) {

		public static NotificationResponse of(Notification n) {
			return new NotificationResponse(n.getId(), n.getCaseId(), n.getType(), n.getTitle(), n.getMessage(),
					n.isRead(), n.getCreatedAt());
		}

	}

}
