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

	// ── Coordinator side (admin portal) ─────────────────────────────────────

	/** Every patient thread, with unread patient messages and the latest message, newest activity first. */
	@Transactional(readOnly = true)
	public List<AdminThread> threadsForAdmin() {
		return threads.findAll().stream().map(t -> {
			List<ChatMessage> list = messages.findByThreadIdOrderByCreatedAtAsc(t.getId());
			ChatMessage last = list.isEmpty() ? null : list.get(list.size() - 1);
			String patientName = patients.findById(t.getPatientId()).map(Patient::getFullName).orElse(null);
			return new AdminThread(t, patientName,
					messages.countByThreadIdAndSenderTypeAndReadFalse(t.getId(), ChatMessage.PATIENT), last);
		})
			.sorted(java.util.Comparator.comparing(AdminThread::activityAt).reversed())
			.toList();
	}

	/** Opens a thread for reading as a coordinator; marks the patient's messages read. */
	@Transactional
	public AdminThreadView threadForAdmin(UUID threadId) {
		ChatThread thread = threads.findById(threadId).orElseThrow(() -> ApiException.notFound("Thread not found."));
		messages.markRead(threadId, ChatMessage.PATIENT);
		String patientName = patients.findById(thread.getPatientId()).map(Patient::getFullName).orElse(null);
		return new AdminThreadView(thread, patientName, messages.findByThreadIdOrderByCreatedAtAsc(threadId));
	}

	@Transactional
	public void closeThread(UUID threadId) {
		threads.findById(threadId).orElseThrow(() -> ApiException.notFound("Thread not found.")).close();
	}

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

	public record AdminThread(ChatThread thread, String patientName, long unread, ChatMessage lastMessage) {

		java.time.Instant activityAt() {
			java.time.Instant a = lastMessage == null ? null : lastMessage.getCreatedAt();
			java.time.Instant b = thread.getReopenRequestedAt();
			java.time.Instant latest = a == null ? b : b == null ? a : (a.isAfter(b) ? a : b);
			return latest == null ? java.time.Instant.EPOCH : latest;
		}

	}

	public record AdminThreadView(ChatThread thread, String patientName, List<ChatMessage> messages) {
	}

}
