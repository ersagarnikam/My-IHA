package com.iha.notification;

import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.iha.common.ApiException;
import com.iha.notification.NotificationController.NotificationResponse;
import com.iha.realtime.RealtimeEvent;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.data.domain.PageRequest;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * In-portal notifications. In the old stack most were written by Postgres
 * triggers; here services call {@link #send} explicitly. Each new notification
 * is pushed to the user's open tabs after commit.
 */
@Service
public class NotificationService {

	/** Same window the old {@code insertNotification} used to drop duplicate sends. */
	private static final Duration DEDUPE_WINDOW = Duration.ofSeconds(60);

	private final NotificationRepository repository;
	private final ApplicationEventPublisher events;

	public NotificationService(NotificationRepository repository, ApplicationEventPublisher events) {
		this.repository = repository;
		this.events = events;
	}

	/** In-portal only. */
	@Transactional
	public void notify(UUID userId, String type, String title, String message, UUID caseId) {
		send(new Draft(userId, type, title, message, caseId, null, false));
	}

	/** In-portal plus email/SMS, honouring the recipient's preferences. */
	@Transactional
	public void notifyWithAlert(UUID userId, String type, String title, String message, UUID caseId) {
		send(new Draft(userId, type, title, message, caseId, null, true));
	}

	@Transactional
	public void send(Draft draft) {
		if (draft.caseId() != null && repository.existsByUserIdAndTypeAndCaseIdAndCreatedAtAfter(draft.userId(),
				draft.type(), draft.caseId(), Instant.now().minus(DEDUPE_WINDOW))) {
			return;
		}
		Notification saved = repository.save(new Notification(draft.userId(), draft.caseId(), draft.assignmentId(),
				draft.type(), draft.title(), draft.message()));
		events.publishEvent(new RealtimeEvent(draft.userId(), "notification", NotificationResponse.of(saved)));
		if (draft.alert()) {
			events.publishEvent(new AlertDispatcher.AlertRequested(saved));
		}
	}

	@Transactional(readOnly = true)
	public List<Notification> recentFor(UUID userId, int limit) {
		return repository.findByUserIdOrderByCreatedAtDesc(userId, PageRequest.of(0, limit));
	}

	@Transactional(readOnly = true)
	public long unreadCount(UUID userId) {
		return repository.countByUserIdAndReadFalse(userId);
	}

	@Transactional(readOnly = true)
	public List<Notification> forCase(UUID userId, UUID caseId) {
		return repository.findByCaseIdAndUserIdOrderByCreatedAtAsc(caseId, userId);
	}

	@Transactional
	public void markRead(UUID userId, UUID notificationId) {
		repository.findByIdAndUserId(notificationId, userId)
			.orElseThrow(() -> ApiException.notFound("Notification not found."))
			.markRead();
	}

	@Transactional
	public void markAllRead(UUID userId) {
		repository.markAllRead(userId);
	}

	/**
	 * @param assignmentId set for provider notifications tied to a doctor assignment
	 * @param alert also send email/SMS
	 */
	public record Draft(UUID userId, String type, String title, String message, UUID caseId, UUID assignmentId,
			boolean alert) {
	}

}
