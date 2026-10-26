package com.iha.patient;

import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import com.iha.audit.AuditService;
import com.iha.auth.AppUser;
import com.iha.auth.AuthService;
import com.iha.auth.CurrentUser;
import com.iha.auth.Role;
import com.iha.common.ApiException;
import com.iha.storage.FileType;
import com.iha.storage.StorageService;
import com.iha.storage.Uploads;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/** Registration, profile and account lifecycle for patients (ported from {@code lib/actions/profile.ts}). */
@Service
public class PatientService {

	private final AuthService authService;
	private final PatientRepository patients;
	private final StorageService storage;
	private final AuditService audit;
	private final ApplicationEventPublisher events;

	public PatientService(AuthService authService, PatientRepository patients, StorageService storage,
			AuditService audit, ApplicationEventPublisher events) {
		this.authService = authService;
		this.patients = patients;
		this.storage = storage;
		this.audit = audit;
		this.events = events;
	}

	/** Creates the account and its patient profile together; the caller must then verify the email. */
	@Transactional
	public Patient register(String fullName, String email, String password) {
		AppUser user = authService.createAccount(email, password, Role.PATIENT);
		Patient patient = patients.save(new Patient(user.getId(), fullName.trim()));
		audit.record(user.getId(), user.getEmail(), "patient", "auth.registered", "patient", patient.getId(), Map.of());
		events.publishEvent(new PatientRegisteredEvent(patient.getId(), user.getId()));
		return patient;
	}

	/** The caller's own patient profile; every patient-scoped query starts here. */
	@Transactional(readOnly = true)
	public Patient requireCurrent(CurrentUser user) {
		Patient patient = patients.findByUserId(user.id())
			.orElseThrow(() -> ApiException.forbidden("patient_profile_missing", "No patient profile for this account."));
		if (patient.isDeleted()) {
			throw ApiException.forbidden("account_deleted", "This account has been deleted.");
		}
		return patient;
	}

	@Transactional
	public Patient updatePersonalInfo(CurrentUser user, String fullName, LocalDate dateOfBirth, String gender,
			String nationality, String countryOfResidence, String phone, String address) {
		Patient patient = requireCurrent(user);
		patient.updatePersonalInfo(fullName.trim(), dateOfBirth, gender, nationality, countryOfResidence, phone.trim(),
				blankToNull(address));
		audit.record(user.id(), user.email(), "patient", "profile.personal_info_updated", "patient", patient.getId(),
				Map.of());
		return patient;
	}

	/** Medical details are sensitive: the audit entry never includes them. */
	@Transactional
	public Patient updateMedicalBackground(CurrentUser user, String medicalHistory, List<String> allergies,
			List<String> currentMedications, String pastSurgeries) {
		Patient patient = requireCurrent(user);
		patient.updateMedicalBackground(blankToNull(medicalHistory), cleanTags(allergies), cleanTags(currentMedications),
				blankToNull(pastSurgeries));
		audit.record(user.id(), user.email(), "patient", "profile.medical_background_updated", "patient",
				patient.getId(), Map.of());
		return patient;
	}

	@Transactional
	public Patient updateEmergencyContact(CurrentUser user, String name, String relationship, String phone) {
		Patient patient = requireCurrent(user);
		patient.updateEmergencyContact(name.trim(), relationship, phone.trim());
		audit.record(user.id(), user.email(), "patient", "profile.emergency_contact_updated", "patient",
				patient.getId(), Map.of());
		return patient;
	}

	@Transactional
	public Patient updateNotificationPreferences(CurrentUser user, boolean email, boolean sms) {
		Patient patient = requireCurrent(user);
		patient.updateNotificationPreferences(email, sms);
		audit.record(user.id(), user.email(), "patient", "profile.notification_preferences_updated", "patient",
				patient.getId(), Map.of("email", email, "sms", sms));
		return patient;
	}

	@Transactional
	public Patient updateAvatar(CurrentUser user, MultipartFile file) {
		Patient patient = requireCurrent(user);
		Uploads.ValidatedUpload upload = Uploads.validate(file, Uploads.AVATAR_MAX_BYTES, FileType.IMAGES);
		String previous = patient.getAvatarPath();
		String path = "avatars/%s/avatar%s".formatted(patient.getId(), upload.type().extension());
		storage.store(path, new ByteArrayInputStream(upload.content()));
		if (previous != null && !previous.equals(path)) {
			storage.delete(previous);
		}
		patient.setAvatarPath(path);
		audit.record(user.id(), user.email(), "patient", "profile.avatar_updated", "patient", patient.getId(), Map.of());
		return patient;
	}

	@Transactional(readOnly = true)
	public Resource loadAvatar(CurrentUser user) {
		Patient patient = requireCurrent(user);
		if (patient.getAvatarPath() == null) {
			throw ApiException.notFound("No profile picture.");
		}
		return storage.load(patient.getAvatarPath());
	}

	/**
	 * Soft delete: sign-in is blocked immediately. After {@link Patient#DELETION_GRACE}
	 * {@link PatientRetentionJob} erases the login and contact details and keeps the
	 * health and payment records for the configured retention period, then purges them.
	 */
	@Transactional
	public void deleteAccount(CurrentUser user) {
		Patient patient = requireCurrent(user);
		patient.markDeleted();
		audit.record(user.id(), user.email(), "patient", "account.deleted", "patient", patient.getId(),
				Map.of("scheduled_delete_at", patient.getScheduledDeleteAt().toString()));
	}

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	private static List<String> cleanTags(List<String> tags) {
		return tags == null ? List.of() : tags.stream().map(String::trim).filter(t -> !t.isEmpty()).distinct().toList();
	}

}
