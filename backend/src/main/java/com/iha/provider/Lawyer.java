package com.iha.provider;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

import com.iha.common.AustralianTimeZones;
import com.iha.crypto.EncryptedStringConverter;
import jakarta.persistence.Column;
import jakarta.persistence.Convert;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.PreUpdate;
import jakarta.persistence.Table;

/**
 * A visa lawyer account: an individual or a law firm, registered through the
 * lawyer portal and reviewed by MTA admin. The credential is either a MARN
 * (registered migration agent) or an Australian practising certificate.
 */
@Entity
@Table(name = "lawyers")
public class Lawyer {

	public static final String PENDING = "pending";
	public static final String APPROVED = "approved";
	public static final String REJECTED = "rejected";
	public static final String MORE_INFO_REQUESTED = "more_info_requested";

	public static final String INDIVIDUAL = "individual";
	public static final String LAW_FIRM = "law_firm";

	/** Registered migration agent (OMARA register). */
	public static final String MARN = "marn";

	/** Australian legal practitioner with a current practising certificate. */
	public static final String PRACTISING_CERTIFICATE = "practising_certificate";

	@Id
	private UUID id;

	@Column(name = "user_id")
	private UUID userId;

	@Column(nullable = false)
	private String name;

	@Column(name = "lawyer_type", nullable = false)
	private String lawyerType;

	@Column(name = "credential_type")
	private String credentialType;

	/** MARN or practising certificate number. */
	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "registration_number_enc")
	private String credentialNumber;

	/** State or territory that issued the practising certificate. */
	@Column(name = "practising_state")
	private String practisingState;

	@Column(name = "credential_expires_on")
	private LocalDate credentialExpiresOn;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "abn_number_enc")
	private String abnNumber;

	/** Immigration law experience or accreditation, free text. */
	@Column(name = "immigration_law_certification")
	private String experience;

	@Column(name = "contact_email")
	private String contactEmail;

	@Column(name = "contact_phone")
	private String phone;

	private String address;

	private String city;

	@Column(name = "zip_code")
	private String zipCode;

	/** JSON array of registration documents. */
	@Column(nullable = false)
	private String certificates;

	@Column(nullable = false)
	private String status;

	@Column(name = "rejection_reason")
	private String rejectionReason;

	@Column(name = "more_info_message")
	private String moreInfoMessage;

	@Column(name = "email_notifications_enabled", nullable = false)
	private boolean emailNotificationsEnabled;

	@Column(name = "sms_notifications_enabled", nullable = false)
	private boolean smsNotificationsEnabled;

	/** IANA zone the account works in; see {@link AustralianTimeZones}. */
	@Column(name = "time_zone", nullable = false)
	private String timeZone = AustralianTimeZones.DEFAULT;

	@Column(name = "created_at", nullable = false, updatable = false)
	private Instant createdAt;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected Lawyer() {
	}

	/** For tests: an approved lawyer with only a name. */
	public Lawyer(UUID userId, String name) {
		this(userId, name, APPROVED);
	}

	private Lawyer(UUID userId, String name, String status) {
		this.id = UUID.randomUUID();
		this.userId = userId;
		this.name = name;
		this.lawyerType = INDIVIDUAL;
		this.certificates = "[]";
		this.status = status;
		this.emailNotificationsEnabled = true;
		this.createdAt = Instant.now();
		this.updatedAt = createdAt;
	}

	/** A lawyer registered through the portal, awaiting MTA review. */
	public static Lawyer registered(UUID userId, String name) {
		return new Lawyer(userId, name, PENDING);
	}

	@PreUpdate
	void touch() {
		updatedAt = Instant.now();
	}

	public boolean isApproved() {
		return APPROVED.equals(status);
	}

	public boolean canResubmit() {
		return REJECTED.equals(status) || MORE_INFO_REQUESTED.equals(status);
	}

	/** Registration or resubmission. Resubmitting goes back to pending review. */
	public void applyRegistration(Profile profile, Credential credential, String certificatesJson) {
		updateProfile(profile);
		updateCredential(credential);
		this.certificates = certificatesJson;
		this.status = PENDING;
		this.rejectionReason = null;
		this.moreInfoMessage = null;
	}

	public void updateProfile(Profile p) {
		this.lawyerType = p.lawyerType();
		this.name = p.name();
		this.abnNumber = p.abnNumber();
		this.contactEmail = p.contactEmail();
		this.phone = p.phone();
		this.address = p.address();
		this.city = p.city();
		this.zipCode = p.zipCode();
		this.experience = p.experience();
	}

	public void updateCredential(Credential c) {
		this.credentialType = c.type();
		this.credentialNumber = c.number();
		this.practisingState = c.practisingState();
		this.credentialExpiresOn = c.expiresOn();
	}

	public void review(String status, String reason) {
		this.status = status;
		this.rejectionReason = REJECTED.equals(status) ? reason : null;
		this.moreInfoMessage = MORE_INFO_REQUESTED.equals(status) ? reason : null;
	}

	public void setTimeZone(String timeZone) {
		this.timeZone = AustralianTimeZones.valid(timeZone);
	}

	public void setNotificationPreferences(boolean email, boolean sms) {
		this.emailNotificationsEnabled = email;
		this.smsNotificationsEnabled = sms;
	}

	public UUID getId() {
		return id;
	}

	public UUID getUserId() {
		return userId;
	}

	public String getName() {
		return name;
	}

	public String getLawyerType() {
		return lawyerType;
	}

	public String getCredentialType() {
		return credentialType;
	}

	public String getCredentialNumber() {
		return credentialNumber;
	}

	public String getPractisingState() {
		return practisingState;
	}

	public LocalDate getCredentialExpiresOn() {
		return credentialExpiresOn;
	}

	public String getAbnNumber() {
		return abnNumber;
	}

	public String getExperience() {
		return experience;
	}

	public String getContactEmail() {
		return contactEmail;
	}

	public String getPhone() {
		return phone;
	}

	public String getAddress() {
		return address;
	}

	public String getCity() {
		return city;
	}

	public String getZipCode() {
		return zipCode;
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

	public boolean isEmailNotificationsEnabled() {
		return emailNotificationsEnabled;
	}

	public boolean isSmsNotificationsEnabled() {
		return smsNotificationsEnabled;
	}

	public String getTimeZone() {
		return timeZone;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	/** Name, firm type, ABN and contact details. {@code contactEmail} is always the login email. */
	public record Profile(String lawyerType, String name, String abnNumber, String contactEmail, String phone,
			String address, String city, String zipCode, String experience) {
	}

	/** MARN or practising certificate. */
	public record Credential(String type, String number, String practisingState, LocalDate expiresOn) {
	}

}
