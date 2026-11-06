package com.iha.admin;

import java.time.Instant;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.UUID;

import com.iha.audit.AuditLog;
import com.iha.audit.AuditLogRepository;
import com.iha.audit.AuditService;
import com.iha.auth.AppUser;
import com.iha.auth.AppUserRepository;
import com.iha.auth.AuthService;
import com.iha.auth.CurrentUser;
import com.iha.auth.Role;
import com.iha.cases.CaseRepository;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.patient.PatientRepository;
import com.iha.provider.DoctorRepository;
import com.iha.provider.HospitalRepository;
import com.iha.provider.LawyerRepository;
import com.iha.realtime.RealtimeHub;

import org.springframework.data.domain.PageRequest;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Every account on the platform: find it, suspend it, help it back in, and add MTA staff. */
@Service
public class AdminUserService {

	private final AppUserRepository users;
	private final PatientRepository patients;
	private final DoctorRepository doctors;
	private final HospitalRepository hospitals;
	private final LawyerRepository lawyers;
	private final CaseRepository cases;
	private final AuthService auth;
	private final AuditService audit;
	private final AuditLogRepository auditLogs;
	private final RealtimeHub hub;
	private final PasswordEncoder passwordEncoder;

	AdminUserService(AppUserRepository users, PatientRepository patients, DoctorRepository doctors,
			HospitalRepository hospitals, LawyerRepository lawyers, CaseRepository cases, AuthService auth,
			AuditService audit, AuditLogRepository auditLogs, RealtimeHub hub, PasswordEncoder passwordEncoder) {
		this.users = users;
		this.patients = patients;
		this.doctors = doctors;
		this.hospitals = hospitals;
		this.lawyers = lawyers;
		this.cases = cases;
		this.auth = auth;
		this.audit = audit;
		this.auditLogs = auditLogs;
		this.hub = hub;
		this.passwordEncoder = passwordEncoder;
	}

	@Transactional(readOnly = true)
	public List<UserRow> list() {
		Map<UUID, Profile> profiles = profiles();
		return users.findAll().stream()
			.sorted(Comparator.comparing(AppUser::getCreatedAt).reversed())
			.map(user -> row(user, profiles.get(user.getId())))
			.toList();
	}

	@Transactional(readOnly = true)
	public UserDetail detail(UUID userId) {
		AppUser user = require(userId);
		List<CaseLink> patientCases = patients.findByUserId(userId)
			.map(p -> cases.findByPatientIdOrderByCreatedAtDesc(p.getId()).stream().map(CaseLink::of).toList())
			.orElse(List.of());
		List<AuditLog> activity = auditLogs.findByActorIdOrderByCreatedAtDesc(userId, PageRequest.of(0, 20));
		return new UserDetail(row(user, profiles().get(userId)), user.getSuspendedReason(), patientCases,
				activity.stream().map(AuditEntry::of).toList());
	}

	@Transactional
	public void suspend(CurrentUser actor, UUID userId, String reason) {
		AppUser user = requireOpen(userId);
		if (user.getId().equals(actor.id())) {
			throw ApiException.conflict("cannot_suspend_self", "You can't suspend your own account.");
		}
		user.suspend(reason.trim());
		audit.record(actor.id(), actor.email(), "admin", "user.suspended", "user", userId,
				Map.of("reason", reason.trim()));
		hub.disconnect(userId);
	}

	@Transactional
	public void reactivate(CurrentUser actor, UUID userId) {
		requireOpen(userId).reactivate();
		audit.record(actor.id(), actor.email(), "admin", "user.reactivated", "user", userId, Map.of());
	}

	@Transactional
	public void sendPasswordReset(CurrentUser actor, UUID userId) {
		auth.requestPasswordReset(requireOpen(userId).getEmail());
		audit.record(actor.id(), actor.email(), "admin", "user.password_reset_sent", "user", userId, Map.of());
	}

	@Transactional
	public void resendVerification(CurrentUser actor, UUID userId) {
		AppUser user = requireOpen(userId);
		if (user.isEmailVerified()) {
			throw ApiException.conflict("already_verified", "This email is already verified.");
		}
		auth.resendCode(user.getEmail());
		audit.record(actor.id(), actor.email(), "admin", "user.verification_resent", "user", userId, Map.of());
	}

	/** New staff have no usable password: they set one with the reset code sent here. */
	@Transactional
	public UUID createAdmin(CurrentUser actor, String email) {
		String normalized = email.trim().toLowerCase(Locale.ROOT);
		if (users.existsByEmail(normalized)) {
			throw ApiException.conflict("email_taken", "An account with this email already exists.");
		}
		AppUser admin = new AppUser(normalized, passwordEncoder.encode(UUID.randomUUID().toString()), Role.ADMIN);
		admin.markEmailVerified();
		users.save(admin);
		audit.record(actor.id(), actor.email(), "admin", "user.admin_created", "user", admin.getId(), Map.of());
		auth.requestPasswordReset(normalized);
		return admin.getId();
	}

	private AppUser require(UUID userId) {
		return users.findById(userId).orElseThrow(() -> ApiException.notFound("Account not found."));
	}

	private AppUser requireOpen(UUID userId) {
		AppUser user = require(userId);
		if (user.isClosed()) {
			throw ApiException.conflict("account_closed", "This account has been closed.");
		}
		return user;
	}

	private Map<UUID, Profile> profiles() {
		Map<UUID, Profile> byUser = new HashMap<>();
		patients.findAll().forEach(p -> byUser.put(p.getUserId(), new Profile(p.getFullName(), null)));
		doctors.findAll().forEach(d -> byUser.put(d.getUserId(), new Profile(d.getFullName(), d.getId())));
		hospitals.findAll().forEach(h -> byUser.put(h.getUserId(), new Profile(h.getName(), h.getId())));
		lawyers.findAll().forEach(l -> byUser.put(l.getUserId(), new Profile(l.getName(), l.getId())));
		return byUser;
	}

	private static UserRow row(AppUser user, Profile profile) {
		String status = user.isClosed() ? "closed"
				: user.isSuspended() ? "suspended" : user.isEmailVerified() ? "active" : "unverified";
		return new UserRow(user.getId(), user.isClosed() ? null : user.getEmail(), user.getRole(),
				profile == null ? null : profile.name(), profile == null ? null : profile.providerId(), status,
				user.getCreatedAt());
	}

	private record Profile(String name, UUID providerId) {
	}

	/** @param providerId the doctor, hospital or lawyer record, for links to their approval page */
	public record UserRow(UUID id, String email, Role role, String name, UUID providerId, String status,
			Instant createdAt) {
	}

	public record CaseLink(UUID id, String referenceNumber, String status) {

		static CaseLink of(MedicalCase c) {
			return new CaseLink(c.getId(), c.getReferenceNumber(), c.getStatus().dbValue());
		}

	}

	public record AuditEntry(UUID id, String actorEmail, String app, String action, String entityType, String entityId,
			String metadata, Instant createdAt) {

		static AuditEntry of(AuditLog log) {
			return new AuditEntry(log.getId(), log.getActorEmail(), log.getApp(), log.getAction(), log.getEntityType(),
					log.getEntityId(), log.getMetadata(), log.getCreatedAt());
		}

	}

	public record UserDetail(UserRow user, String suspendedReason, List<CaseLink> cases, List<AuditEntry> activity) {
	}

}
