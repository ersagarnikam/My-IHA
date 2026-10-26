package com.iha.patient;

import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.iha.crypto.EncryptedLocalDateConverter;
import com.iha.crypto.EncryptedStringConverter;
import com.iha.crypto.EncryptedStringListConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/** A patient profile. Personal and medical fields are encrypted at rest. */
@Entity
@Table(name = "patients")
public class Patient {

	/** Grace period between "delete my account" and the hard delete. */
	public static final Duration DELETION_GRACE = Duration.ofDays(30);

	@Id
	private UUID id;

	@Column(name = "user_id", nullable = false, updatable = false)
	private UUID userId;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "full_name_enc", nullable = false)
	private String fullName;

	@Convert(converter = EncryptedLocalDateConverter.class)
	@Column(name = "date_of_birth_enc")
	private LocalDate dateOfBirth;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "phone_enc")
	private String phone;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "address_enc")
	private String address;

	private String gender;

	private String nationality;

	@Column(name = "country_of_residence")
	private String countryOfResidence;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "medical_history_enc")
	private String medicalHistory;

	@Convert(converter = EncryptedStringListConverter.class)
	@Column(name = "allergies_enc")
	private List<String> allergies;

	@Convert(converter = EncryptedStringListConverter.class)
	@Column(name = "current_medications_enc")
	private List<String> currentMedications;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "past_surgeries_enc")
	private String pastSurgeries;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "emergency_contact_name_enc")
	private String emergencyContactName;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "emergency_contact_relationship_enc")
	private String emergencyContactRelationship;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "emergency_contact_phone_enc")
	private String emergencyContactPhone;

	/** Storage path of the avatar image (served through the API, never public). */
	@Column(name = "avatar_url")
	private String avatarPath;

	@Column(name = "stripe_customer_id")
	private String stripeCustomerId;

	@Column(name = "email_notifications_enabled", nullable = false)
	private boolean emailNotificationsEnabled = true;

	@Column(name = "sms_notifications_enabled", nullable = false)
	private boolean smsNotificationsEnabled;

	@Column(name = "is_deleted", nullable = false)
	private boolean deleted;

	@Column(name = "deleted_at")
	private Instant deletedAt;

	@Column(name = "scheduled_delete_at")
	private Instant scheduledDeleteAt;

	/** When the grace period ended and the login and contact details were erased. */
	@Column(name = "account_closed_at")
	private Instant accountClosedAt;

	/** Health and payment records are kept until then, then purged. */
	@Column(name = "retain_until")
	private Instant retainUntil;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected Patient() {
	}

	public Patient(UUID userId, String fullName) {
		this.id = UUID.randomUUID();
		this.userId = userId;
		this.fullName = fullName;
		this.createdAt = Instant.now();
		this.updatedAt = this.createdAt;
	}

	@PreUpdate
	void touch() {
		updatedAt = Instant.now();
	}

	/** The old dashboard gate: onboarding is done once DOB and an emergency contact exist. */
	public boolean isProfileComplete() {
		return dateOfBirth != null && emergencyContactName != null && !emergencyContactName.isBlank();
	}

	void updatePersonalInfo(String fullName, LocalDate dateOfBirth, String gender, String nationality,
			String countryOfResidence, String phone, String address) {
		this.fullName = fullName;
		this.dateOfBirth = dateOfBirth;
		this.gender = gender;
		this.nationality = nationality;
		this.countryOfResidence = countryOfResidence;
		this.phone = phone;
		this.address = address;
	}

	void updateMedicalBackground(String medicalHistory, List<String> allergies, List<String> currentMedications,
			String pastSurgeries) {
		this.medicalHistory = medicalHistory;
		this.allergies = allergies;
		this.currentMedications = currentMedications;
		this.pastSurgeries = pastSurgeries;
	}

	void updateEmergencyContact(String name, String relationship, String phone) {
		this.emergencyContactName = name;
		this.emergencyContactRelationship = relationship;
		this.emergencyContactPhone = phone;
	}

	void updateNotificationPreferences(boolean email, boolean sms) {
		this.emailNotificationsEnabled = email;
		this.smsNotificationsEnabled = sms;
	}

	void setAvatarPath(String avatarPath) {
		this.avatarPath = avatarPath;
	}

	public void setStripeCustomerId(String stripeCustomerId) {
		this.stripeCustomerId = stripeCustomerId;
	}

	void markDeleted() {
		if (!deleted) {
			deleted = true;
			deletedAt = Instant.now();
			scheduledDeleteAt = deletedAt.plus(DELETION_GRACE);
		}
	}

	/**
	 * After the grace period: erases contact and convenience data (phone,
	 * address, emergency contact, photo, payment-provider id, alert settings).
	 * Name, date of birth and the medical details stay with the retained health
	 * records until {@code retainUntil}.
	 */
	void closeAccount(Instant retainUntil) {
		this.phone = null;
		this.address = null;
		this.emergencyContactName = null;
		this.emergencyContactRelationship = null;
		this.emergencyContactPhone = null;
		this.avatarPath = null;
		this.stripeCustomerId = null;
		this.emailNotificationsEnabled = false;
		this.smsNotificationsEnabled = false;
		this.accountClosedAt = Instant.now();
		this.retainUntil = retainUntil;
	}

	public Instant getAccountClosedAt() {
		return accountClosedAt;
	}

	public Instant getRetainUntil() {
		return retainUntil;
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

	public String getPhone() {
		return phone;
	}

	public String getAddress() {
		return address;
	}

	public String getGender() {
		return gender;
	}

	public String getNationality() {
		return nationality;
	}

	public String getCountryOfResidence() {
		return countryOfResidence;
	}

	public String getMedicalHistory() {
		return medicalHistory;
	}

	public List<String> getAllergies() {
		return allergies;
	}

	public List<String> getCurrentMedications() {
		return currentMedications;
	}

	public String getPastSurgeries() {
		return pastSurgeries;
	}

	public String getEmergencyContactName() {
		return emergencyContactName;
	}

	public String getEmergencyContactRelationship() {
		return emergencyContactRelationship;
	}

	public String getEmergencyContactPhone() {
		return emergencyContactPhone;
	}

	public String getAvatarPath() {
		return avatarPath;
	}

	public String getStripeCustomerId() {
		return stripeCustomerId;
	}

	public boolean isEmailNotificationsEnabled() {
		return emailNotificationsEnabled;
	}

	public boolean isSmsNotificationsEnabled() {
		return smsNotificationsEnabled;
	}

	public boolean isDeleted() {
		return deleted;
	}

	public Instant getScheduledDeleteAt() {
		return scheduledDeleteAt;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

}
