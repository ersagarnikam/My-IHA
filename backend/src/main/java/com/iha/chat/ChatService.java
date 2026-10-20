package com.iha.chat;

import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.common.ApiException;
import com.iha.patient.Patient;
import com.iha.patient.PatientRegisteredEvent;
import com.iha.patient.PatientRepository;
import com.iha.patient.PatientService;
import com.iha.realtime.RealtimeEvent;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Patient ↔ coordinator chat (ported from {@code @iha/db/chat} and the
 * {@code chat_*} RLS policies: patients may only post while the thread is open).
 */
@Service
public class ChatService {

	private final ChatThreadRepository threads;
	private final ChatMessageRepository messages;
	private final PatientService patientService;
	private final PatientRepository patients;
	private final AuditService audit;
	private final ApplicationEventPublisher events;

	ChatService(ChatThreadRepository threads, ChatMessageRepository messages, PatientService patientService,
			PatientRepository patients, AuditService audit, ApplicationEventPublisher events) {
		this.threads = threads;
		this.messages = messages;
		this.patientService = patientService;
		this.patients = patients;
		this.audit = audit;
		this.events = events;
	}

	/** Replaces the {@code patients_create_chat_thread} trigger. */
	@EventListener
	void createThread(PatientRegisteredEvent event) {
		threads.save(new ChatThread(event.patientId()));
	}

	@Transactional
	public ThreadView threadForPatient(CurrentUser user) {
		ChatThread thread = requireThread(patientService.requireCurrent(user));
		return new ThreadView(thread, messages.findByThreadIdOrderByCreatedAtAsc(thread.getId()),
				messages.countByThreadIdAndSenderTypeAndReadFalse(thread.getId(), ChatMessage.ADMIN));
	}

	@Transactional
	public long unreadForPatient(CurrentUser user) {
		ChatThread thread = requireThread(patientService.requireCurrent(user));
		return messages.countByThreadIdAndSenderTypeAndReadFalse(thread.getId(), ChatMessage.ADMIN);
	}

	@Transactional
	public ChatMessage sendAsPatient(CurrentUser user, String body) {
		ChatThread thread = requireThread(patientService.requireCurrent(user));
		if (!thread.isOpen()) {
			throw ApiException.conflict("thread_closed",
					"This conversation is closed. Request to reopen it to send a message.");
		}
		ChatMessage message = messages.save(new ChatMessage(thread.getId(), user.id(), ChatMessage.PATIENT, body.trim()));
		events.publishEvent(new RealtimeEvent(user.id(), "chat_message", ChatController.MessageResponse.of(message)));
		return message;
	}

	@Transactional
	public void markAdminMessagesRead(CurrentUser user) {
		ChatThread thread = requireThread(patientService.requireCurrent(user));
		messages.markRead(thread.getId(), ChatMessage.ADMIN);
	}

	@Transactional
	public ChatThread requestReopen(CurrentUser user, String reason) {
		Patient patient = patientService.requireCurrent(user);
		ChatThread thread = requireThread(patient);
		if (thread.isOpen()) {
			throw ApiException.conflict("thread_open", "This conversation is already open.");
		}
		thread.requestReopen(reason.trim());
		audit.record(user.id(), user.email(), "patient", "chat.reopen_requested", "chat_thread", thread.getId(),
				Map.of());
		return thread;
	}

	// ── Coordinator side (the admin portal will expose these) ───────────────

	@Transactional
	public void openThread(UUID threadId) {
		threads.findById(threadId).orElseThrow(() -> ApiException.notFound("Thread not found.")).open();
	}

	@Transactional
	public ChatMessage sendAsAdmin(UUID threadId, UUID adminUserId, String body) {
		ChatThread thread = threads.findById(threadId).orElseThrow(() -> ApiException.notFound("Thread not found."));
		ChatMessage message = messages.save(new ChatMessage(thread.getId(), adminUserId, ChatMessage.ADMIN, body.trim()));
		patients.findById(thread.getPatientId())
			.ifPresent(p -> events.publishEvent(
					new RealtimeEvent(p.getUserId(), "chat_message", ChatController.MessageResponse.of(message))));
		return message;
	}

	private ChatThread requireThread(Patient patient) {
		// Accounts created before threads existed get one lazily.
		return threads.findByPatientId(patient.getId()).orElseGet(() -> threads.save(new ChatThread(patient.getId())));
	}

	public record ThreadView(ChatThread thread, List<ChatMessage> messages, long unread) {
	}

}
