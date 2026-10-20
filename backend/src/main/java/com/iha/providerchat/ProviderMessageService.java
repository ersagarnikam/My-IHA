package com.iha.providerchat;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.iha.audit.AuditService;
import com.iha.common.ApiException;
import com.iha.notification.NotificationService;
import com.iha.realtime.RealtimeEvent;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Provider ↔ MTA admin support chat (ported from {@code @iha/db/provider-messages},
 * the {@code handle_new_*_message_thread} triggers and
 * {@code notify_provider_on_admin_message}). Providers may only post while the
 * thread is open. Each role module resolves its own {@link ProviderAccount}.
 */
@Service
public class ProviderMessageService {

	private final ProviderMessageThreadRepository threads;
	private final ProviderMessageRepository messages;
	private final NotificationService notifications;
	private final AuditService audit;
	private final ApplicationEventPublisher events;

	ProviderMessageService(ProviderMessageThreadRepository threads, ProviderMessageRepository messages,
			NotificationService notifications, AuditService audit, ApplicationEventPublisher events) {
		this.threads = threads;
		this.messages = messages;
		this.notifications = notifications;
		this.audit = audit;
		this.events = events;
	}

	/** Replaces the {@code handle_new_*_message_thread} triggers; safe to call more than once. */
	@Transactional
	public ProviderMessageThread ensureThread(ProviderAccount account) {
		return find(account).orElseGet(() -> threads.save(new ProviderMessageThread(account)));
	}

	@Transactional
	public ThreadView thread(ProviderAccount account) {
		ProviderMessageThread thread = ensureThread(account);
		return new ThreadView(thread, messages.findByThreadIdOrderByCreatedAtAsc(thread.getId()),
				messages.countByThreadIdAndSenderTypeAndReadFalse(thread.getId(), ProviderMessage.ADMIN));
	}

	@Transactional
	public long unread(ProviderAccount account) {
		return messages.countByThreadIdAndSenderTypeAndReadFalse(ensureThread(account).getId(), ProviderMessage.ADMIN);
	}

	@Transactional
	public ProviderMessage send(ProviderAccount account, String email, String body) {
		ProviderMessageThread thread = ensureThread(account);
		if (!thread.isOpen()) {
			throw ApiException.conflict("thread_closed",
					"This conversation is closed. Request to reopen it to send a message.");
		}
		ProviderMessage message = messages.save(new ProviderMessage(thread.getId(), account.userId(), account.type(),
				body.trim()));
		events.publishEvent(new RealtimeEvent(account.userId(), "provider_message", MessageView.of(message)));
		audit.record(account.userId(), email, account.type(), "provider_message.sent", "provider_message_thread",
				thread.getId(), Map.of());
		return message;
	}

	@Transactional
	public void markAdminMessagesRead(ProviderAccount account) {
		messages.markRead(ensureThread(account).getId(), ProviderMessage.ADMIN);
	}

	@Transactional
	public void requestReopen(ProviderAccount account, String email, String reason) {
		ProviderMessageThread thread = ensureThread(account);
		if (thread.isOpen()) {
			throw ApiException.conflict("thread_open", "This conversation is already open.");
		}
		thread.requestReopen(reason.trim());
		audit.record(account.userId(), email, account.type(), "provider_message.reopen_requested",
				"provider_message_thread", thread.getId(), Map.of());
	}

	// ── Admin side (the admin portal will expose these) ─────────────────────

	@Transactional
	public void open(UUID threadId) {
		threads.findById(threadId).orElseThrow(() -> ApiException.notFound("Thread not found.")).open();
	}

	@Transactional
	public void close(UUID threadId) {
		threads.findById(threadId).orElseThrow(() -> ApiException.notFound("Thread not found.")).close();
	}

	/** Also writes the provider's "New message from MTA Admin" notification. */
	@Transactional
	public ProviderMessage sendAsAdmin(UUID threadId, UUID adminUserId, UUID providerUserId, String body) {
		ProviderMessageThread thread = threads.findById(threadId)
			.orElseThrow(() -> ApiException.notFound("Thread not found."));
		ProviderMessage message = messages.save(new ProviderMessage(thread.getId(), adminUserId, ProviderMessage.ADMIN,
				body.trim()));
		if (providerUserId != null) {
			String preview = message.getBody().length() > 140 ? message.getBody().substring(0, 140) + "..."
					: message.getBody();
			notifications.notify(providerUserId, "new_message", "New message from MTA Admin", preview, null);
			events.publishEvent(new RealtimeEvent(providerUserId, "provider_message", MessageView.of(message)));
		}
		return message;
	}

	private Optional<ProviderMessageThread> find(ProviderAccount account) {
		return switch (account.type()) {
			case ProviderAccount.DOCTOR -> threads.findByDoctorId(account.id());
			case ProviderAccount.HOSPITAL -> threads.findByHospitalId(account.id());
			case ProviderAccount.LAWYER -> threads.findByLawyerId(account.id());
			default -> throw new IllegalArgumentException(account.type());
		};
	}

	public record ThreadView(ProviderMessageThread thread, List<ProviderMessage> messages, long unread) {
	}

	public record MessageView(UUID id, String senderType, String body, boolean read, Instant createdAt) {

		public static MessageView of(ProviderMessage m) {
			return new MessageView(m.getId(), m.getSenderType(), m.getBody(), m.isRead(), m.getCreatedAt());
		}

	}

}
