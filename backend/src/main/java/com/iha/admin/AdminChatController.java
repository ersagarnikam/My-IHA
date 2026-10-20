package com.iha.admin;

import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.UUID;

import com.iha.auth.CurrentUser;
import com.iha.chat.ChatMessage;
import com.iha.chat.ChatService;
import com.iha.common.ApiException;
import com.iha.patient.PatientRepository;
import com.iha.provider.DoctorRepository;
import com.iha.provider.HospitalRepository;
import com.iha.provider.LawyerRepository;
import com.iha.providerchat.ProviderMessage;
import com.iha.providerchat.ProviderMessageService;
import com.iha.providerchat.ProviderMessageThread;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * The coordinator inbox: patient support chats ({@code kind=patient}) and
 * provider chats ({@code kind=provider}). Threads start closed; opening one lets
 * the other side write.
 */
@RestController
@RequestMapping("/api/admin/chats")
public class AdminChatController {

	private final ChatService chat;
	private final ProviderMessageService providerMessages;
	private final PatientRepository patients;
	private final DoctorRepository doctors;
	private final HospitalRepository hospitals;
	private final LawyerRepository lawyers;

	AdminChatController(ChatService chat, ProviderMessageService providerMessages, PatientRepository patients,
			DoctorRepository doctors, HospitalRepository hospitals, LawyerRepository lawyers) {
		this.chat = chat;
		this.providerMessages = providerMessages;
		this.patients = patients;
		this.doctors = doctors;
		this.hospitals = hospitals;
		this.lawyers = lawyers;
	}

	@GetMapping
	@Transactional(readOnly = true)
	public List<ThreadRow> threads() {
		List<ThreadRow> rows = new ArrayList<>();
		for (ChatService.AdminThread t : chat.threadsForAdmin()) {
			rows.add(new ThreadRow("patient", t.thread().getId(), t.patientName(), "patient", t.thread().getStatus(),
					t.unread(), t.thread().getReopenRequestedAt(), t.thread().getReopenReason(),
					t.lastMessage() == null ? null : LastMessage.of(t.lastMessage())));
		}
		for (ProviderMessageService.AdminThread t : providerMessages.threadsForAdmin()) {
			rows.add(new ThreadRow("provider", t.thread().getId(), providerName(t.thread()), t.thread().getAccountType(),
					t.thread().getStatus(), t.unread(), t.thread().getReopenRequestedAt(), t.thread().getReopenReason(),
					t.lastMessage() == null ? null : LastMessage.of(t.lastMessage())));
		}
		rows.sort(Comparator.comparing(ThreadRow::needsAttention).reversed()
			.thenComparing(Comparator.comparing(ThreadRow::activityAt).reversed()));
		return rows;
	}

	@GetMapping("/{kind}/{threadId}")
	@Transactional
	public ThreadResponse thread(@PathVariable String kind, @PathVariable UUID threadId) {
		return load(kind, threadId);
	}

	@PostMapping("/{kind}/{threadId}/open")
	public ThreadResponse open(@PathVariable String kind, @PathVariable UUID threadId) {
		if (patient(kind)) {
			chat.openThread(threadId);
		}
		else {
			providerMessages.open(threadId);
		}
		return load(kind, threadId);
	}

	@PostMapping("/{kind}/{threadId}/close")
	public ThreadResponse close(@PathVariable String kind, @PathVariable UUID threadId) {
		if (patient(kind)) {
			chat.closeThread(threadId);
		}
		else {
			providerMessages.close(threadId);
		}
		return load(kind, threadId);
	}

	@PostMapping("/{kind}/{threadId}/messages")
	@ResponseStatus(HttpStatus.CREATED)
	public ThreadResponse send(@AuthenticationPrincipal Jwt jwt, @PathVariable String kind, @PathVariable UUID threadId,
			@Valid @RequestBody SendRequest request) {
		UUID adminId = CurrentUser.from(jwt).id();
		if (patient(kind)) {
			chat.sendAsAdmin(threadId, adminId, request.body());
		}
		else {
			ProviderMessageThread thread = providerMessages.threadForAdmin(threadId).thread();
			providerMessages.sendAsAdmin(threadId, adminId, providerUserId(thread), request.body());
		}
		return load(kind, threadId);
	}

	private ThreadResponse load(String kind, UUID threadId) {
		if (patient(kind)) {
			ChatService.AdminThreadView v = chat.threadForAdmin(threadId);
			return new ThreadResponse("patient", v.thread().getId(), v.patientName(), "patient", v.thread().getStatus(),
					v.thread().getReopenRequestedAt(), v.thread().getReopenReason(),
					v.messages().stream()
						.map(m -> new MessageResponse(m.getId(), m.getSenderType(), m.getBody(), m.getCreatedAt()))
						.toList());
		}
		ProviderMessageService.ThreadView v = providerMessages.threadForAdmin(threadId);
		return new ThreadResponse("provider", v.thread().getId(), providerName(v.thread()), v.thread().getAccountType(),
				v.thread().getStatus(), v.thread().getReopenRequestedAt(), v.thread().getReopenReason(),
				v.messages().stream()
					.map((ProviderMessage m) -> new MessageResponse(m.getId(), m.getSenderType(), m.getBody(),
							m.getCreatedAt()))
					.toList());
	}

	private static boolean patient(String kind) {
		if ("patient".equals(kind)) {
			return true;
		}
		if ("provider".equals(kind)) {
			return false;
		}
		throw ApiException.notFound("Thread not found.");
	}

	private String providerName(ProviderMessageThread t) {
		if (t.getDoctorId() != null) {
			return doctors.findById(t.getDoctorId()).map(d -> d.getFullName()).orElse("Doctor");
		}
		if (t.getHospitalId() != null) {
			return hospitals.findById(t.getHospitalId()).map(h -> h.getName()).orElse("Hospital");
		}
		return lawyers.findById(t.getLawyerId()).map(l -> l.getName()).orElse("Lawyer");
	}

	private UUID providerUserId(ProviderMessageThread t) {
		if (t.getDoctorId() != null) {
			return doctors.findById(t.getDoctorId()).map(d -> d.getUserId()).orElse(null);
		}
		if (t.getHospitalId() != null) {
			return hospitals.findById(t.getHospitalId()).map(h -> h.getUserId()).orElse(null);
		}
		return lawyers.findById(t.getLawyerId()).map(l -> l.getUserId()).orElse(null);
	}

	public record SendRequest(@NotBlank @Size(max = 5000) String body) {
	}

	public record LastMessage(String senderType, String body, Instant createdAt) {

		static LastMessage of(ChatMessage m) {
			return new LastMessage(m.getSenderType(), preview(m.getBody()), m.getCreatedAt());
		}

		static LastMessage of(ProviderMessage m) {
			return new LastMessage(m.getSenderType(), preview(m.getBody()), m.getCreatedAt());
		}

		private static String preview(String body) {
			return body.length() > 120 ? body.substring(0, 120) + "…" : body;
		}

	}

	/** @param accountType patient, doctor, hospital or lawyer */
	public record ThreadRow(String kind, UUID id, String name, String accountType, String status, long unread,
			Instant reopenRequestedAt, String reopenReason, LastMessage lastMessage) {

		boolean needsAttention() {
			return unread > 0 || ("closed".equals(status) && reopenRequestedAt != null);
		}

		Instant activityAt() {
			Instant a = lastMessage == null ? null : lastMessage.createdAt();
			Instant b = reopenRequestedAt;
			Instant latest = a == null ? b : b == null ? a : (a.isAfter(b) ? a : b);
			return latest == null ? Instant.EPOCH : latest;
		}

	}

	public record MessageResponse(UUID id, String senderType, String body, Instant createdAt) {
	}

	public record ThreadResponse(String kind, UUID id, String name, String accountType, String status,
			Instant reopenRequestedAt, String reopenReason, List<MessageResponse> messages) {
	}

}
