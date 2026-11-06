package com.iha.admin;

import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import com.iha.audit.AuditLog;
import com.iha.audit.AuditLogRepository;
import com.iha.auth.CurrentUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.http.HttpStatus;
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

/** MTA admin: accounts and the audit log. */
@RestController
@RequestMapping("/api/admin")
public class AdminUserController {

	private static final int AUDIT_PAGE_SIZE = 50;

	private final AdminUserService users;
	private final AuditLogRepository auditLogs;

	AdminUserController(AdminUserService users, AuditLogRepository auditLogs) {
		this.users = users;
		this.auditLogs = auditLogs;
	}

	@GetMapping("/users")
	public List<AdminUserService.UserRow> list() {
		return users.list();
	}

	@GetMapping("/users/{userId}")
	public AdminUserService.UserDetail detail(@PathVariable UUID userId) {
		return users.detail(userId);
	}

	@PostMapping("/users/{userId}/suspend")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void suspend(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID userId,
			@Valid @RequestBody SuspendRequest request) {
		users.suspend(CurrentUser.from(jwt), userId, request.reason());
	}

	@PostMapping("/users/{userId}/reactivate")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void reactivate(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID userId) {
		users.reactivate(CurrentUser.from(jwt), userId);
	}

	@PostMapping("/users/{userId}/password-reset")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void passwordReset(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID userId) {
		users.sendPasswordReset(CurrentUser.from(jwt), userId);
	}

	@PostMapping("/users/{userId}/resend-verification")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void resendVerification(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID userId) {
		users.resendVerification(CurrentUser.from(jwt), userId);
	}

	@PostMapping("/users/admins")
	@ResponseStatus(HttpStatus.CREATED)
	public Map<String, UUID> createAdmin(@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody CreateAdminRequest request) {
		return Map.of("id", users.createAdmin(CurrentUser.from(jwt), request.email()));
	}

	/** Newest first; {@code q} matches the action, actor, record type or record id. */
	@GetMapping("/audit")
	public AuditPage audit(@RequestParam(defaultValue = "") String q, @RequestParam(defaultValue = "0") int page) {
		String pattern = "%" + q.trim().toLowerCase(Locale.ROOT) + "%";
		Page<AuditLog> found = auditLogs.search(pattern, PageRequest.of(Math.max(page, 0), AUDIT_PAGE_SIZE));
		return new AuditPage(found.getContent().stream().map(AdminUserService.AuditEntry::of).toList(),
				found.getNumber(), found.getTotalPages(), found.getTotalElements());
	}

	public record SuspendRequest(@NotBlank @Size(min = 10, max = 500) String reason) {
	}

	public record CreateAdminRequest(@NotBlank @Email @Size(max = 254) String email) {
	}

	public record AuditPage(List<AdminUserService.AuditEntry> rows, int page, int pages, long total) {
	}

}
