package com.iha.provider;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.iha.common.AustralianTimeZones;
import com.iha.crypto.EncryptedLocalDateConverter;
import com.iha.crypto.EncryptedStringConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * A doctor account. Lifecycle: pending (registered) → approved by MTA admin
 * (or rejected / more_info_requested, then resubmitted) → registration fee
 * paid, which unlocks the portal; an annual fee falls due a year later.
 */
@Entity
@Table(name = "doctors")
public class Doctor {

	public static final String PENDING = "pending";
	public static final String APPROVED = "approved";
	public static final String REJECTED = "rejected";
	public static final String MORE_INFO_REQUESTED = "more_info_requested";

	@Id
	private UUID id;

	@Column(name = "user_id")
	private UUID userId;

	@Column(name = "full_name", nullable = false)
	private String fullName;

	@Convert(converter = EncryptedLocalDateConverter.class)
	@Column(name = "date_of_birth_enc")
	private LocalDate dateOfBirth;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "license_number_enc")
	private String licenseNumber;

	private String gender;

	private String role;

	private String department;

	private String[] specialties;

	private String qualifications;

	@Column(name = "years_experience")
	private Integer yearsExperience;

	@Column(name = "languages_spoken")
	private String[] languagesSpoken;

	private String bio;

	/** Storage path of the profile photo (served by {@code GET /api/doctor/profile/photo}). */
	@Column(name = "photo_url")
	private String photoUrl;

	@Column(name = "contact_email")
	private String contactEmail;

	@Column(name = "contact_phone")
	private String contactPhone;

	@Column(name = "working_days", nullable = false)
	private String[] workingDays;

	/** JSON array of {day, enabled, start_time, end_time}; "[]"/"{}" until first saved. */
	@Column(name = "availability_schedule", nullable = false)
	private String availabilityScheduleJson;

	/** JSON array of uploaded registration documents. */
	@Column(nullable = false)
	private String certificates;

	@Column(nullable = false)
	private String status;

	@Column(name = "rejection_reason")
	private String rejectionReason;

	@Column(name = "more_info_message")
	private String moreInfoMessage;

	@Column(name = "registration_fee_paid_at")
	private Instant registrationFeePaidAt;

	@Column(name = "annual_fee_next_due_at")
	private Instant annualFeeNextDueAt;

	@Column(name = "annual_fee_reminder_sent_for")
	private LocalDate annualFeeReminderSentFor;

	@Column(name = "email_notifications_enabled", nullable = false)
	private boolean emailNotificationsEnabled;

	@Column(name = "sms_notifications_enabled", nullable = false)
	private boolean smsNotificationsEnabled;

	/** IANA zone the account works in; see {@link AustralianTimeZones}. */
	@Column(name = "time_zone", nullable = false)
	private String timeZone = AustralianTimeZones.DEFAULT;

	@Column(name = "indemnity_insurer")
	private String indemnityInsurer;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "indemnity_policy_number_enc")
	private String indemnityPolicyNumber;

	@Column(name = "indemnity_expires_on")
	private LocalDate indemnityExpiresOn;

	@Column(name = "indemnity_covers_overseas", nullable = false)
	private boolean indemnityCoversOverseas;

	@Column(name = "telehealth_guidelines_ack", nullable = false)
	private boolean telehealthGuidelinesAck;

	@Column(name = "indemnity_declared_at")
	private Instant indemnityDeclaredAt;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	protected Doctor() {
	}

	/** An approved doctor with only a name (tests and dev simulation). */
	public Doctor(UUID userId, String fullName) {
		this(userId, fullName, APPROVED);
	}

	/** A new registration, waiting for MTA approval. */
	public static Doctor registered(UUID userId, String fullName) {
		return new Doctor(userId, fullName, PENDING);
	}

	private Doctor(UUID userId, String fullName, String status) {
		this.id = UUID.randomUUID();
		this.userId = userId;
		this.fullName = fullName;
		this.workingDays = new String[0];
		this.availabilityScheduleJson = "[]";
		this.certificates = "[]";
		this.status = status;
		this.emailNotificationsEnabled = true;
		this.createdAt = Instant.now();
	}

	public boolean isApproved() {
		return APPROVED.equals(status);
	}

	public boolean canResubmit() {
		return REJECTED.equals(status) || MORE_INFO_REQUESTED.equals(status);
	}

	/** Approved and registration fee paid: the portal is unlocked. */
	public boolean isActive() {
		return isApproved() && registrationFeePaidAt != null;
	}

	/** Registration / resubmission details. Resubmitting sends the account back to pending review. */
	public void applyRegistration(Registration r) {
		this.fullName = r.fullName();
		this.contactEmail = r.contactEmail();
		this.contactPhone = r.contactPhone();
		this.specialties = r.specialties();
		this.qualifications = r.qualifications();
		this.yearsExperience = r.yearsExperience();
		this.licenseNumber = r.licenseNumber();
		this.bio = r.bio();
		this.languagesSpoken = r.languagesSpoken();
		this.department = r.department();
		this.role = r.role();
		this.workingDays = r.workingDays();
		this.availabilityScheduleJson = "[]";
		this.certificates = r.certificatesJson();
		if (r.photoPath() != null) {
			this.photoUrl = r.photoPath();
		}
		this.status = PENDING;
		this.rejectionReason = null;
		this.moreInfoMessage = null;
	}

	public void updatePersonal(String fullName, String contactPhone, LocalDate dateOfBirth, String gender) {
		this.fullName = fullName;
		this.contactPhone = contactPhone;
		this.dateOfBirth = dateOfBirth;
		this.gender = gender;
	}

	public void updateProfessional(String[] specialties, String qualifications, int yearsExperience,
			String licenseNumber, String bio, String[] languagesSpoken, String department, String role) {
		this.specialties = specialties;
		this.qualifications = qualifications;
		this.yearsExperience = yearsExperience;
		this.licenseNumber = licenseNumber;
		this.bio = bio;
		this.languagesSpoken = languagesSpoken;
		this.department = department;
		this.role = role;
	}

	public void updateAvailability(String scheduleJson, String[] workingDays) {
		this.availabilityScheduleJson = scheduleJson;
		this.workingDays = workingDays;
	}

	public void setTimeZone(String timeZone) {
		this.timeZone = AustralianTimeZones.valid(timeZone);
	}

	/** Professional indemnity and telehealth declaration (see {@code DoctorAccountService.declareIndemnity}). */
	public void declareIndemnity(String insurer, String policyNumber, LocalDate expiresOn, boolean coversOverseas,
			boolean telehealthAck) {
		this.indemnityInsurer = insurer;
		this.indemnityPolicyNumber = policyNumber;
		this.indemnityExpiresOn = expiresOn;
		this.indemnityCoversOverseas = coversOverseas;
		this.telehealthGuidelinesAck = telehealthAck;
		this.indemnityDeclaredAt = Instant.now();
	}

	/** The declaration, or null when the doctor hasn't made one. */
	public Indemnity getIndemnity() {
		return indemnityDeclaredAt == null ? null
				: new Indemnity(indemnityInsurer, indemnityPolicyNumber, indemnityExpiresOn, indemnityCoversOverseas,
						telehealthGuidelinesAck, indemnityDeclaredAt);
	}

	public void setNotificationPreferences(boolean email, boolean sms) {
		this.emailNotificationsEnabled = email;
		this.smsNotificationsEnabled = sms;
	}

	public void setPhotoUrl(String photoUrl) {
		this.photoUrl = photoUrl;
	}

	/** MTA admin review outcome. */
	public void review(String status, String reason) {
		this.status = status;
		this.rejectionReason = REJECTED.equals(status) ? reason : null;
		this.moreInfoMessage = MORE_INFO_REQUESTED.equals(status) ? reason : null;
	}

	public void markRegistrationFeePaid(Instant paidAt, Instant annualDueAt) {
		this.registrationFeePaidAt = paidAt;
		this.annualFeeNextDueAt = annualDueAt;
	}

	public void markAnnualFeePaid(Instant nextDueAt) {
		this.annualFeeNextDueAt = nextDueAt;
		this.annualFeeReminderSentFor = null;
	}

	public UUID getId() {
		return id;
	}

	public UUID getUserId() {
		return userId;
	}

	public String getFullName() {
		return fullName;
	}

	public LocalDate getDateOfBirth() {
		return dateOfBirth;
	}

	public String getLicenseNumber() {
		return licenseNumber;
	}

	public String getGender() {
		return gender;
	}

	public String getRole() {
		return role;
	}

	public String getDepartment() {
		return department;
	}

	public String[] getSpecialties() {
		return specialties;
	}

	public String getQualifications() {
		return qualifications;
	}

	public Integer getYearsExperience() {
		return yearsExperience;
	}

	public String[] getLanguagesSpoken() {
		return languagesSpoken;
	}

	public String getBio() {
		return bio;
	}

	public String getPhotoUrl() {
		return photoUrl;
	}

	public String getContactEmail() {
		return contactEmail;
	}

	public String getContactPhone() {
		return contactPhone;
	}

	public String[] getWorkingDays() {
		return workingDays;
	}

	public String getAvailabilityScheduleJson() {
		return availabilityScheduleJson;
	}

	public String getCertificates() {
		return certificates;
	}

	public String getStatus() {
		return status;
	}

	public String getRejectionReason() {
		return rejectionReason;
	}

	public String getMoreInfoMessage() {
		return moreInfoMessage;
	}

	public Instant getRegistrationFeePaidAt() {
		return registrationFeePaidAt;
	}

	public Instant getAnnualFeeNextDueAt() {
		return annualFeeNextDueAt;
	}

	public boolean isEmailNotificationsEnabled() {
		return emailNotificationsEnabled;
	}

	public String getTimeZone() {
		return timeZone;
	}

	public boolean isSmsNotificationsEnabled() {
		return smsNotificationsEnabled;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public record Indemnity(String insurer, String policyNumber, LocalDate expiresOn, boolean coversOverseas,
			boolean telehealthGuidelinesAck, Instant declaredAt) {

		/** {@code missing}, {@code expired} or {@code valid}. */
		public static String status(Indemnity i, LocalDate today) {
			if (i == null || !i.coversOverseas() || !i.telehealthGuidelinesAck()) {
				return "missing";
			}
			return i.expiresOn().isBefore(today) ? "expired" : "valid";
		}

	}

	public record Registration(String fullName, String contactEmail, String contactPhone, String[] specialties,
			String qualifications, int yearsExperience, String licenseNumber, String bio, String[] languagesSpoken,
			String department, String role, String[] workingDays, String certificatesJson, String photoPath) {
	}

}
