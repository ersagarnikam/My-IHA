package com.iha.doctor;

import java.io.ByteArrayInputStream;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import com.fasterxml.jackson.annotation.JsonProperty;
import com.iha.audit.AuditService;
import com.iha.auth.AppUser;
import com.iha.auth.AuthService;
import com.iha.auth.CurrentUser;
import com.iha.auth.Role;
import com.iha.common.AustralianTimeZones;
import com.iha.common.ApiException;
import com.iha.notification.AlertPreferences;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorHospitalAffiliation;
import com.iha.provider.DoctorHospitalAffiliationRepository;
import com.iha.provider.DoctorRepository;
import com.iha.provider.Hospital;
import com.iha.provider.HospitalRepository;
import com.iha.providerchat.ProviderAccount;
import com.iha.providerchat.ProviderMessageService;
import com.iha.specialty.SpecialtyRepository;
import com.iha.storage.FileType;
import com.iha.storage.StorageService;
import com.iha.storage.Uploads;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

/**
 * Doctor accounts (ported from {@code register_doctor}, {@code resubmit_doctor_registration},
 * the account-settings RPCs and the dashboard layout's approval/fee gate).
 * Every doctor-scoped query starts from {@link #requireActive} or {@link #requireCurrent}.
 */
@Service
public class DoctorAccountService implements AlertPreferences {

	public static final Set<String> GENDERS = Set.of("male", "female", "other", "prefer_not_to_say");
	public static final Set<String> ROLES = Set.of("consultant", "surgeon");
	public static final List<String> WORKING_DAYS = List.of("mon", "tue", "wed", "thu", "fri", "sat", "sun");
	static final List<String> AVAILABILITY_DAYS = List.of("monday", "tuesday", "wednesday", "thursday", "friday",
			"saturday", "sunday");
	private static final Pattern LICENSE = Pattern.compile("[A-Z]{3}\\d{10}");
	private static final Pattern TIME = Pattern.compile("([01]\\d|2[0-3]):[0-5]\\d");

	private final DoctorRepository doctors;
	private final DoctorHospitalAffiliationRepository affiliations;
	private final HospitalRepository hospitals;
	private final SpecialtyRepository specialties;
	private final AuthService authService;
	private final ProviderMessageService providerMessages;
	private final StorageService storage;
	private final AuditService audit;
	private final JsonMapper json;

	DoctorAccountService(DoctorRepository doctors, DoctorHospitalAffiliationRepository affiliations,
			HospitalRepository hospitals, SpecialtyRepository specialties, AuthService authService,
			ProviderMessageService providerMessages, StorageService storage, AuditService audit, JsonMapper json) {
		this.doctors = doctors;
		this.affiliations = affiliations;
		this.hospitals = hospitals;
		this.specialties = specialties;
		this.authService = authService;
		this.providerMessages = providerMessages;
		this.storage = storage;
		this.audit = audit;
		this.json = json;
	}

	// ── Sign-up and registration ────────────────────────────────────────────

	/** Step 1 of the wizard: the login. The profile follows once the email is verified. */
	@Transactional
	public AppUser createAccount(String email, String password) {
		AppUser user = authService.createAccount(email, password, Role.DOCTOR);
		audit.record(user.getId(), user.getEmail(), "doctor", "auth.registered", "user", user.getId(), Map.of());
		return user;
	}

	@Transactional
	public Doctor register(CurrentUser user, RegistrationInput input, RegistrationFiles files) {
		if (doctors.findByUserId(user.id()).isPresent()) {
			throw ApiException.conflict("already_registered", "You have already submitted your registration.");
		}
		Doctor doctor = Doctor.registered(user.id(), input.fullName().trim());
		apply(user, doctor, input, files, List.of(), true);
		doctor.setTimeZone(input.timeZone());
		doctor = doctors.save(doctor);
		replaceAffiliations(doctor, input.hospitalIds());
		providerMessages.ensureThread(account(doctor));
		audit.record(user.id(), user.email(), "doctor", "registration.doctor_submitted", "doctor", doctor.getId(),
				Map.of());
		return doctor;
	}

	/** Only after MTA rejected the registration or asked for more information. */
	@Transactional
	public Doctor resubmit(CurrentUser user, RegistrationInput input, RegistrationFiles files) {
		Doctor doctor = requireCurrent(user);
		if (!doctor.canResubmit()) {
			throw ApiException.conflict("not_resubmittable", "Your registration is not awaiting changes.");
		}
		apply(user, doctor, input, files, documents(doctor), false);
		if (input.timeZone() != null) {
			doctor.setTimeZone(input.timeZone());
		}
		replaceAffiliations(doctor, input.hospitalIds());
		audit.record(user.id(), user.email(), "doctor", "registration.resubmitted", "doctor", doctor.getId(), Map.of());
		return doctor;
	}

	private void apply(CurrentUser user, Doctor doctor, RegistrationInput input, RegistrationFiles files,
			List<RegistrationDocument> existing, boolean newRegistration) {
		String[] specialtyList = validSpecialties(input.specialties());
		String license = validLicense(input.licenseNumber());
		if (input.role() == null || !ROLES.contains(input.role())) {
			throw ApiException.badRequest("invalid_role", "Select a role.");
		}
		List<String> days = input.workingDays() == null ? List.of()
				: input.workingDays().stream().distinct().toList();
		if (days.isEmpty() || !WORKING_DAYS.containsAll(days)) {
			throw ApiException.badRequest("working_days_required", "Select at least one working day.");
		}
		validHospitals(input.hospitalIds());
		if (newRegistration && (isEmpty(files.medicalLicense()) || isEmpty(files.degreeCertificate()))) {
			throw ApiException.badRequest("documents_required",
					"Upload your medical license and degree certificate.");
		}

		// Keep earlier documents of a category unless a new one replaces it.
		Map<String, RegistrationDocument> byCategory = new LinkedHashMap<>();
		List<RegistrationDocument> others = new ArrayList<>();
		for (RegistrationDocument d : existing) {
			if ("other".equals(d.category())) {
				others.add(d);
			}
			else {
				byCategory.put(d.category(), d);
			}
		}
		storeDocument(user, files.medicalLicense(), "medical_license").ifPresent(d -> byCategory.put(d.category(), d));
		storeDocument(user, files.degreeCertificate(), "degree_certificate")
			.ifPresent(d -> byCategory.put(d.category(), d));
		if (files.otherDocuments() != null) {
			for (MultipartFile f : files.otherDocuments()) {
				storeDocument(user, f, "other").ifPresent(others::add);
			}
		}
		List<RegistrationDocument> all = new ArrayList<>(byCategory.values());
		all.addAll(others);
		if (all.isEmpty()) {
			throw ApiException.badRequest("documents_required", "At least one document is required.");
		}

		String photoPath = null;
		if (files.photo() != null && !files.photo().isEmpty()) {
			photoPath = storePhoto(doctor, files.photo());
		}
		doctor.applyRegistration(new Doctor.Registration(input.fullName().trim(), user.email(),
				input.contactPhone().trim(), specialtyList, input.qualifications().trim(), input.yearsOfExperience(),
				license, input.bio().trim(), cleanList(input.languagesSpoken()), input.department().trim(),
				input.role(), days.toArray(String[]::new), json.writeValueAsString(all), photoPath));
	}

	private java.util.Optional<RegistrationDocument> storeDocument(CurrentUser user, MultipartFile file,
			String category) {
		if (file == null || file.isEmpty()) {
			return java.util.Optional.empty();
		}
		Uploads.ValidatedUpload upload = Uploads.validate(file, Uploads.DOCUMENT_MAX_BYTES, FileType.DOCUMENTS);
		String path = "registration-documents/%s/%s%s".formatted(user.id(), UUID.randomUUID(),
				upload.type().extension());
		storage.store(path, new ByteArrayInputStream(upload.content()));
		String name = upload.originalName() != null && !upload.originalName().isBlank() ? upload.originalName()
				: category + upload.type().extension();
		return java.util.Optional.of(new RegistrationDocument(name, path, upload.type().mimeType(),
				upload.content().length, category));
	}

	// ── The signed-in doctor ────────────────────────────────────────────────

	@Transactional(readOnly = true)
	public java.util.Optional<Doctor> find(CurrentUser user) {
		return doctors.findByUserId(user.id());
	}

	/** Any registered doctor (pending ones too: the gate pages need their status). */
	@Transactional(readOnly = true)
	public Doctor requireCurrent(CurrentUser user) {
		return doctors.findByUserId(user.id())
			.orElseThrow(() -> ApiException.forbidden("doctor_profile_missing",
					"Complete your doctor registration first."));
	}

	/** Approved with the registration fee paid; required for everything past the gate. */
	@Transactional(readOnly = true)
	public Doctor requireActive(CurrentUser user) {
		Doctor doctor = requireCurrent(user);
		if (!doctor.isApproved()) {
			throw ApiException.forbidden("doctor_not_approved", "Your registration is awaiting MTA approval.");
		}
		if (doctor.getRegistrationFeePaidAt() == null) {
			throw ApiException.forbidden("registration_fee_unpaid", "Pay the registration fee to unlock your account.");
		}
		return doctor;
	}

	public ProviderAccount account(Doctor doctor) {
		return new ProviderAccount(ProviderAccount.DOCTOR, doctor.getId(), doctor.getUserId());
	}

	@Transactional(readOnly = true)
	public List<UUID> hospitalIds(Doctor doctor) {
		return affiliations.findByDoctorId(doctor.getId()).stream().map(DoctorHospitalAffiliation::getHospitalId).toList();
	}

	@Transactional(readOnly = true)
	public List<Hospital> affiliatedHospitals(Doctor doctor) {
		return hospitals.findAllById(hospitalIds(doctor)).stream()
			.sorted((a, b) -> a.getName().compareToIgnoreCase(b.getName()))
			.toList();
	}

	/** Hospitals a doctor can pick as affiliations. */
	@Transactional(readOnly = true)
	public List<Hospital> approvedHospitals() {
		return hospitals.findByStatusOrderByNameAsc("approved");
	}

	public List<RegistrationDocument> documents(Doctor doctor) {
		return json.readValue(doctor.getCertificates(), new TypeReference<List<RegistrationDocument>>() {
		});
	}

	@Transactional(readOnly = true)
	public Resource loadDocument(CurrentUser user, int index) {
		return loadDocument(requireCurrent(user), index);
	}

	/** For MTA admin reviewing a registration. */
	@Transactional(readOnly = true)
	public Resource loadDocument(Doctor doctor, int index) {
		List<RegistrationDocument> docs = documents(doctor);
		if (index < 0 || index >= docs.size()) {
			throw ApiException.notFound("Document not found.");
		}
		return storage.load(docs.get(index).filePath());
	}

	/** The saved schedule, or one derived from the registration working days until first saved. */
	public List<AvailabilityDay> availability(Doctor doctor) {
		List<AvailabilityDay> saved = doctor.getAvailabilityScheduleJson().trim().startsWith("[")
				? json.readValue(doctor.getAvailabilityScheduleJson(), new TypeReference<List<AvailabilityDay>>() {
				}) : List.of();
		if (saved.size() == 7) {
			return saved;
		}
		Set<String> working = new LinkedHashSet<>(Arrays.asList(nonNull(doctor.getWorkingDays())));
		return AVAILABILITY_DAYS.stream()
			.map(day -> new AvailabilityDay(day, working.contains(day.substring(0, 3)), "09:00", "17:00"))
			.toList();
	}

	// ── Account settings ────────────────────────────────────────────────────

	@Transactional
	public Doctor updatePersonal(CurrentUser user, String fullName, String phone, LocalDate dateOfBirth, String gender) {
		Doctor doctor = requireActive(user);
		if (!GENDERS.contains(gender)) {
			throw ApiException.badRequest("invalid_gender", "Select a gender.");
		}
		if (dateOfBirth.isAfter(LocalDate.now().minusYears(18))) {
			throw ApiException.badRequest("invalid_date_of_birth", "Enter a valid date of birth.");
		}
		doctor.updatePersonal(fullName.trim(), phone.trim(), dateOfBirth, gender);
		audit.record(user.id(), user.email(), "doctor", "doctor.profile_updated", "doctor", doctor.getId(), Map.of());
		return doctor;
	}

	@Transactional
	public Doctor updateProfessional(CurrentUser user, ProfessionalInput input) {
		Doctor doctor = requireActive(user);
		if (!ROLES.contains(input.role())) {
			throw ApiException.badRequest("invalid_role", "Select a role.");
		}
		validHospitals(input.hospitalIds());
		doctor.updateProfessional(validSpecialties(input.specialties()), input.qualifications().trim(),
				input.yearsOfExperience(), validLicense(input.licenseNumber()), input.bio().trim(),
				cleanList(input.languagesSpoken()), input.department().trim(), input.role());
		replaceAffiliations(doctor, input.hospitalIds());
		audit.record(user.id(), user.email(), "doctor", "doctor.professional_details_updated", "doctor",
				doctor.getId(), Map.of());
		return doctor;
	}

	/** Also keeps {@code working_days} in step with the enabled days. */
	@Transactional
	public Doctor updateAvailability(CurrentUser user, List<AvailabilityDay> days) {
		Doctor doctor = requireActive(user);
		if (days == null || days.size() != 7
				|| !days.stream().map(AvailabilityDay::day).toList().equals(AVAILABILITY_DAYS)) {
			throw ApiException.badRequest("invalid_availability", "Send one entry per day, Monday to Sunday.");
		}
		if (days.stream().noneMatch(AvailabilityDay::enabled)) {
			throw ApiException.badRequest("working_days_required", "Select at least one working day.");
		}
		for (AvailabilityDay d : days) {
			if (d.enabled() && (d.startTime() == null || d.endTime() == null || !TIME.matcher(d.startTime()).matches()
					|| !TIME.matcher(d.endTime()).matches() || d.endTime().compareTo(d.startTime()) <= 0)) {
				throw ApiException.badRequest("invalid_hours",
						"On " + capitalize(d.day()) + ", the end time must be after the start time.");
			}
		}
		doctor.updateAvailability(json.writeValueAsString(days), days.stream()
			.filter(AvailabilityDay::enabled)
			.map(d -> d.day().substring(0, 3))
			.toArray(String[]::new));
		audit.record(user.id(), user.email(), "doctor", "doctor.availability_updated", "doctor", doctor.getId(),
				Map.of());
		return doctor;
	}

	/** Consultation times are entered and shown in this zone; existing slots keep their instant. */
	@Transactional
	public Doctor updateTimeZone(CurrentUser user, String timeZone) {
		Doctor doctor = requireActive(user);
		doctor.setTimeZone(AustralianTimeZones.valid(timeZone));
		audit.record(user.id(), user.email(), "doctor", "doctor.time_zone_updated", "doctor", doctor.getId(),
				Map.of("time_zone", doctor.getTimeZone()));
		return doctor;
	}

	/**
	 * The doctor declares professional indemnity insurance that covers
	 * consultations with patients located outside Australia and acknowledges the
	 * Medical Board's telehealth guidelines. Needed before offering consultations.
	 * (Wording for MTA's lawyer to confirm.)
	 */
	@Transactional
	public Doctor declareIndemnity(CurrentUser user, IndemnityInput input) {
		Doctor doctor = requireActive(user);
		String insurer = input.insurer() == null ? "" : input.insurer().trim();
		String policy = input.policyNumber() == null ? "" : input.policyNumber().trim();
		if (insurer.length() < 2) {
			throw ApiException.badRequest("insurer_required", "Enter your indemnity insurer.");
		}
		if (policy.length() < 3) {
			throw ApiException.badRequest("policy_number_required", "Enter your policy or membership number.");
		}
		if (input.expiresOn() == null || input.expiresOn().isBefore(LocalDate.now(AustralianTimeZones.zone(doctor.getTimeZone())))) {
			throw ApiException.badRequest("invalid_indemnity_expiry", "Enter the expiry date of a current policy.");
		}
		if (!input.coversOverseas()) {
			throw ApiException.badRequest("overseas_cover_required",
					"Your cover must include consultations with patients located outside Australia.");
		}
		if (!input.telehealthGuidelinesAck()) {
			throw ApiException.badRequest("telehealth_ack_required", "Acknowledge the telehealth guidelines.");
		}
		doctor.declareIndemnity(insurer, policy, input.expiresOn(), true, true);
		audit.record(user.id(), user.email(), "doctor", "doctor.indemnity_declared", "doctor", doctor.getId(),
				Map.of("expires_on", input.expiresOn().toString()));
		return doctor;
	}

	@Transactional
	public Doctor updateNotificationPreferences(CurrentUser user, boolean email, boolean sms) {
		Doctor doctor = requireActive(user);
		doctor.setNotificationPreferences(email, sms);
		audit.record(user.id(), user.email(), "doctor", "doctor.notification_preferences_updated", "doctor",
				doctor.getId(), Map.of());
		return doctor;
	}

	@Transactional
	public Doctor updatePhoto(CurrentUser user, MultipartFile file) {
		Doctor doctor = requireCurrent(user);
		String previous = doctor.getPhotoUrl();
		doctor.setPhotoUrl(storePhoto(doctor, file));
		if (previous != null && !previous.equals(doctor.getPhotoUrl())) {
			try {
				storage.delete(previous);
			}
			catch (RuntimeException ignored) {
				// An orphaned old photo is harmless.
			}
		}
		audit.record(user.id(), user.email(), "doctor", "doctor.avatar_updated", "doctor", doctor.getId(), Map.of());
		return doctor;
	}

	@Transactional(readOnly = true)
	public Resource loadPhoto(CurrentUser user) {
		Doctor doctor = requireCurrent(user);
		if (doctor.getPhotoUrl() == null) {
			throw ApiException.notFound("No profile photo.");
		}
		return storage.load(doctor.getPhotoUrl());
	}

	@Override
	public Channels channelsFor(UUID userId) {
		return doctors.findByUserId(userId)
			.map(d -> new Channels(d.isEmailNotificationsEnabled(), d.isSmsNotificationsEnabled(), d.getContactPhone()))
			.orElse(null);
	}

	// ── Helpers ─────────────────────────────────────────────────────────────

	private String storePhoto(Doctor doctor, MultipartFile file) {
		Uploads.ValidatedUpload upload = Uploads.validate(file, Uploads.AVATAR_MAX_BYTES, FileType.IMAGES);
		String path = "avatars/doctors/%s/%s%s".formatted(doctor.getId(), UUID.randomUUID(), upload.type().extension());
		storage.store(path, new ByteArrayInputStream(upload.content()));
		return path;
	}

	private void replaceAffiliations(Doctor doctor, List<UUID> hospitalIds) {
		affiliations.deleteByDoctor(doctor.getId());
		if (hospitalIds != null) {
			hospitalIds.stream().distinct().forEach(id -> affiliations.save(new DoctorHospitalAffiliation(doctor.getId(), id)));
		}
	}

	private void validHospitals(List<UUID> hospitalIds) {
		if (hospitalIds == null || hospitalIds.isEmpty()) {
			return;
		}
		Set<UUID> approved = new java.util.HashSet<>();
		hospitals.findAllById(hospitalIds).stream()
			.filter(h -> "approved".equals(h.getStatus()))
			.forEach(h -> approved.add(h.getId()));
		if (!approved.containsAll(hospitalIds)) {
			throw ApiException.badRequest("invalid_hospital", "Choose hospitals from the list.");
		}
	}

	private String[] validSpecialties(List<String> requested) {
		List<String> list = requested == null ? List.of()
				: requested.stream().filter(s -> s != null && !s.isBlank()).map(String::trim).distinct().toList();
		if (list.isEmpty()) {
			throw ApiException.badRequest("at_least_one_specialty_required", "Select at least one specialty.");
		}
		for (String s : list) {
			if (!specialties.existsByNameAndActiveTrue(s)) {
				throw ApiException.badRequest("invalid_specialty", "Unknown specialty: " + s);
			}
		}
		return list.toArray(String[]::new);
	}

	/** AHPRA registration number: 3 letters and 10 digits, e.g. MED0001234567. */
	static String validLicense(String value) {
		String normalized = value == null ? "" : value.trim().toUpperCase(java.util.Locale.ROOT);
		if (!LICENSE.matcher(normalized).matches()) {
			throw ApiException.badRequest("invalid_license_number",
					"Enter a valid AHPRA number (3 letters followed by 10 digits, e.g. MED0001234567)");
		}
		return normalized;
	}

	private static String[] cleanList(List<String> values) {
		List<String> list = values == null ? List.of()
				: values.stream().filter(s -> s != null && !s.isBlank()).map(String::trim).distinct().toList();
		if (list.isEmpty()) {
			throw ApiException.badRequest("languages_required", "Select at least one language.");
		}
		return list.toArray(String[]::new);
	}

	private static boolean isEmpty(MultipartFile file) {
		return file == null || file.isEmpty();
	}

	private static String[] nonNull(String[] values) {
		return values == null ? new String[0] : values;
	}

	private static String capitalize(String s) {
		return Character.toUpperCase(s.charAt(0)) + s.substring(1);
	}

	/** {@code timeZone}: one of {@link AustralianTimeZones#SUPPORTED}; null keeps the default (Brisbane). */
	public record IndemnityInput(String insurer, String policyNumber, LocalDate expiresOn, boolean coversOverseas,
			boolean telehealthGuidelinesAck) {
	}

	public record RegistrationInput(String fullName, String contactPhone, List<String> specialties,
			String qualifications, int yearsOfExperience, String licenseNumber, String bio,
			List<String> languagesSpoken, String department, String role, List<UUID> hospitalIds,
			List<String> workingDays, String timeZone) {

		public RegistrationInput(String fullName, String contactPhone, List<String> specialties,
				String qualifications, int yearsOfExperience, String licenseNumber, String bio,
				List<String> languagesSpoken, String department, String role, List<UUID> hospitalIds,
				List<String> workingDays) {
			this(fullName, contactPhone, specialties, qualifications, yearsOfExperience, licenseNumber, bio,
					languagesSpoken, department, role, hospitalIds, workingDays, null);
		}

	}

	public record RegistrationFiles(MultipartFile photo, MultipartFile medicalLicense, MultipartFile degreeCertificate,
			List<MultipartFile> otherDocuments) {
	}

	public record ProfessionalInput(List<String> specialties, String qualifications, int yearsOfExperience,
			String licenseNumber, String bio, List<String> languagesSpoken, String department, String role,
			List<UUID> hospitalIds) {
	}

	public record RegistrationDocument(String fileName, String filePath, String mimeType, long fileSizeBytes,
			String category) {
	}

	public record AvailabilityDay(String day, boolean enabled, @JsonProperty("start_time") String startTime,
			@JsonProperty("end_time") String endTime) {
	}

}
