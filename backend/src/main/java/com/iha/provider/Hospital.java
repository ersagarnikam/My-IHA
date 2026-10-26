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
import jakarta.persistence.Table;

/**
 * A hospital account. Seeded hospitals have no login ({@code userId} null);
 * hospitals that register through the hospital portal start {@code pending}
 * and are reviewed by MTA admin.
 */
@Entity
@Table(name = "hospitals")
public class Hospital {

	public static final String PENDING = "pending";
	public static final String APPROVED = "approved";
	public static final String REJECTED = "rejected";
	public static final String MORE_INFO_REQUESTED = "more_info_requested";

	public static final String MULTI_SPECIALTY = "multi_specialty";
	public static final String SINGLE_SPECIALTY = "single_specialty";

	@Id
	private UUID id;

	@Column(name = "user_id")
	private UUID userId;

	@Column(nullable = false)
	private String name;

	/** multi_specialty or single_specialty. */
	@Column(name = "registration_type")
	private String registrationType;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "registration_number_enc")
	private String registrationNumber;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "license_number_enc")
	private String licenseNumber;

	@Convert(converter = EncryptedStringConverter.class)
	@Column(name = "abn_number_enc")
	private String abnNumber;

	@Column(name = "accreditation_body")
	private String accreditationBody;

	/** NSQHS accreditation certificate expiry, as declared by the hospital. */
	@Column(name = "accreditation_expires_on")
	private LocalDate accreditationExpiresOn;

	/** State private-hospital licence expiry, as declared by the hospital. */
	@Column(name = "licence_expires_on")
	private LocalDate licenceExpiresOn;

	private String address;

	@Column(nullable = false)
	private String city;

	@Column(nullable = false)
	private String country;

	@Column(name = "zip_code")
	private String zipCode;

	private String phone;

	@Column(name = "contact_email")
	private String contactEmail;

	@Column(name = "bed_count")
	private Integer bedCount;

	@Column(name = "room_types", nullable = false)
	private String[] roomTypes;

	private String[] specialties;

	/** JSON list of registration documents. */
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

	protected Hospital() {
	}

	/** For tests and seed data: an approved hospital without a login. */
	public Hospital(UUID userId, String name, String city, String country) {
		this(userId, name, city, country, APPROVED);
	}

	private Hospital(UUID userId, String name, String city, String country, String status) {
		this.id = UUID.randomUUID();
		this.userId = userId;
		this.name = name;
		this.city = city;
		this.country = country;
		this.roomTypes = new String[0];
		this.certificates = "[]";
		this.status = status;
		this.emailNotificationsEnabled = true;
		this.createdAt = Instant.now();
	}

	/** A hospital registered through the portal, awaiting MTA review. */
	public static Hospital registered(UUID userId, String name, String city, String country) {
		return new Hospital(userId, name, city, country, PENDING);
	}

	public boolean isApproved() {
		return APPROVED.equals(status);
	}

	public boolean canResubmit() {
		return REJECTED.equals(status) || MORE_INFO_REQUESTED.equals(status);
	}

	/** Registration or resubmission: everything the wizard collects. Resubmitting goes back to pending review. */
	public void applyRegistration(BasicInfo basic, Details details, String certificatesJson) {
		updateBasicInfo(basic);
		updateDetails(details);
		this.certificates = certificatesJson;
		this.status = PENDING;
		this.rejectionReason = null;
		this.moreInfoMessage = null;
	}

	public void updateBasicInfo(BasicInfo b) {
		this.name = b.name();
		this.registrationNumber = b.registrationNumber();
		this.abnNumber = b.abnNumber();
		this.phone = b.phone();
		this.contactEmail = b.contactEmail();
		this.country = b.country();
		this.city = b.city();
		this.address = b.address();
		this.zipCode = b.zipCode();
	}

	public void updateDetails(Details d) {
		this.registrationType = d.registrationType();
		this.specialties = d.specialties();
		this.bedCount = d.bedCount();
		this.roomTypes = d.roomTypes();
		this.licenseNumber = d.licenseNumber();
		this.accreditationBody = d.accreditationBody();
		this.accreditationExpiresOn = d.accreditationExpiresOn();
		this.licenceExpiresOn = d.licenceExpiresOn();
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

	public void setRoomTypes(String[] roomTypes) {
		this.roomTypes = roomTypes;
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

	public String getRegistrationType() {
		return registrationType;
	}

	public String getRegistrationNumber() {
		return registrationNumber;
	}

	public String getLicenseNumber() {
		return licenseNumber;
	}

	public LocalDate getAccreditationExpiresOn() {
		return accreditationExpiresOn;
	}

	public LocalDate getLicenceExpiresOn() {
		return licenceExpiresOn;
	}

	public String getAbnNumber() {
		return abnNumber;
	}

	public String getAccreditationBody() {
		return accreditationBody;
	}

	public String getAddress() {
		return address;
	}

	public String getCity() {
		return city;
	}

	public String getCountry() {
		return country;
	}

	public String getZipCode() {
		return zipCode;
	}

	public String getPhone() {
		return phone;
	}

	public String getContactEmail() {
		return contactEmail;
	}

	public Integer getBedCount() {
		return bedCount;
	}

	public String[] getRoomTypes() {
		return roomTypes;
	}

	public String[] getSpecialties() {
		return specialties;
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

	public String getTimeZone() {
		return timeZone;
	}

	public boolean isSmsNotificationsEnabled() {
		return smsNotificationsEnabled;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}

	public record BasicInfo(String name, String registrationNumber, String abnNumber, String phone,
			String contactEmail, String country, String city, String address, String zipCode) {
	}

	public record Details(String registrationType, String[] specialties, Integer bedCount, String[] roomTypes,
			String licenseNumber, String accreditationBody, LocalDate accreditationExpiresOn,
			LocalDate licenceExpiresOn) {
	}

}
