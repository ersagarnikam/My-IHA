package com.iha.hospital;

import java.io.ByteArrayInputStream;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.regex.Pattern;

import com.iha.audit.AuditService;
import com.iha.auth.AppUser;
import com.iha.auth.AuthService;
import com.iha.auth.CurrentUser;
import com.iha.auth.Role;
import com.iha.common.ApiException;
import com.iha.notification.AlertPreferences;
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
 * Hospital accounts (ported from {@code register_hospital}, {@code resubmit_hospital_registration},
 * {@code update_hospital_basic_info} / {@code update_hospital_details} and the dashboard
 * layout's approval gate). Every hospital-scoped query starts from {@link #requireApproved}
 * or {@link #requireCurrent}. Hospitals aren't charged fees yet.
 */
@Service
public class HospitalAccountService implements AlertPreferences {

	static final Set<String> TYPES = Set.of(Hospital.MULTI_SPECIALTY, Hospital.SINGLE_SPECIALTY);

	/** Registration and licence numbers: 4–20 letters, digits or hyphens. */
	private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z0-9-]{4,20}");

	private final HospitalRepository hospitals;
	private final SpecialtyRepository specialties;
	private final AuthService authService;
	private final ProviderMessageService providerMessages;
	private final StorageService storage;
	private final AuditService audit;
	private final JsonMapper json;

	HospitalAccountService(HospitalRepository hospitals, SpecialtyRepository specialties, AuthService authService,
			ProviderMessageService providerMessages, StorageService storage, AuditService audit, JsonMapper json) {
		this.hospitals = hospitals;
		this.specialties = specialties;
		this.authService = authService;
		this.providerMessages = providerMessages;
		this.storage = storage;
		this.audit = audit;
		this.json = json;
	}

	// ── Sign-up and registration ────────────────────────────────────────────

	/** Step 1 of the wizard: the login. The hospital profile follows once the email is verified. */
	@Transactional
	public AppUser createAccount(String email, String password) {
		AppUser user = authService.createAccount(email, password, Role.HOSPITAL);
		audit.record(user.getId(), user.getEmail(), "hospital", "auth.registered", "user", user.getId(), Map.of());
		return user;
	}

	@Transactional
	public Hospital register(CurrentUser user, RegistrationInput input, RegistrationFiles files) {
		if (hospitals.findByUserId(user.id()).isPresent()) {
			throw ApiException.conflict("already_registered", "You have already submitted your registration.");
		}
		Hospital hospital = Hospital.registered(user.id(), input.basic().name().trim(), input.basic().city().trim(),
				input.basic().country().trim());
		hospital.applyRegistration(basicInfo(user, input.basic()), details(input.details()),
				certificates(user, files, List.of(), true));
		hospital = hospitals.save(hospital);
		providerMessages.ensureThread(account(hospital));
		audit.record(user.id(), user.email(), "hospital", "registration.hospital_submitted", "hospital",
				hospital.getId(), Map.of());
		return hospital;
	}

	/** Only after MTA rejected the registration or asked for more information. */
	@Transactional
	public Hospital resubmit(CurrentUser user, RegistrationInput input, RegistrationFiles files) {
		Hospital hospital = requireCurrent(user);
		if (!hospital.canResubmit()) {
			throw ApiException.conflict("not_resubmittable", "Your registration is not awaiting changes.");
		}
		hospital.applyRegistration(basicInfo(user, input.basic()), details(input.details()),
				certificates(user, files, documents(hospital), false));
		audit.record(user.id(), user.email(), "hospital", "registration.resubmitted", "hospital", hospital.getId(),
				Map.of());
		return hospital;
	}

	// ── The signed-in hospital ──────────────────────────────────────────────

	@Transactional(readOnly = true)
	public Optional<Hospital> find(CurrentUser user) {
		return hospitals.findByUserId(user.id());
	}

	/** Any registered hospital (pending ones too: the gate page needs the status). */
	@Transactional(readOnly = true)
	public Hospital requireCurrent(CurrentUser user) {
		return hospitals.findByUserId(user.id())
			.orElseThrow(() -> ApiException.forbidden("hospital_profile_missing",
					"Complete your hospital registration first."));
	}

	/** Approved by MTA; required for everything past the gate. */
	@Transactional(readOnly = true)
	public Hospital requireApproved(CurrentUser user) {
		Hospital hospital = requireCurrent(user);
		if (!hospital.isApproved()) {
			throw ApiException.forbidden("hospital_not_approved", "Your registration is awaiting MTA approval.");
		}
		return hospital;
	}

	public ProviderAccount account(Hospital hospital) {
		return new ProviderAccount(ProviderAccount.HOSPITAL, hospital.getId(), hospital.getUserId());
	}

	public List<RegistrationDocument> documents(Hospital hospital) {
		return json.readValue(hospital.getCertificates(), new TypeReference<List<RegistrationDocument>>() {
		});
	}

	@Transactional(readOnly = true)
	public Resource loadDocument(CurrentUser user, int index) {
		return loadDocument(requireCurrent(user), index);
	}

	/** For MTA admin reviewing a registration. */
	@Transactional(readOnly = true)
	public Resource loadDocument(Hospital hospital, int index) {
		List<RegistrationDocument> docs = documents(hospital);
		if (index < 0 || index >= docs.size()) {
			throw ApiException.notFound("Document not found.");
		}
		return storage.load(docs.get(index).filePath());
	}

	// ── Account settings ────────────────────────────────────────────────────

	@Transactional
	public Hospital updateBasicInfo(CurrentUser user, BasicInput input) {
		Hospital hospital = requireApproved(user);
		hospital.updateBasicInfo(basicInfo(user, input));
		audit.record(user.id(), user.email(), "hospital", "hospital.profile_updated", "hospital", hospital.getId(),
				Map.of());
		return hospital;
	}

	@Transactional
	public Hospital updateDetails(CurrentUser user, DetailsInput input) {
		Hospital hospital = requireApproved(user);
		hospital.updateDetails(details(input));
		audit.record(user.id(), user.email(), "hospital", "hospital.details_updated", "hospital", hospital.getId(),
				Map.of());
		return hospital;
	}

	@Transactional
	public Hospital updateNotificationPreferences(CurrentUser user, boolean email, boolean sms) {
		Hospital hospital = requireApproved(user);
		hospital.setNotificationPreferences(email, sms);
		audit.record(user.id(), user.email(), "hospital", "hospital.notification_preferences_updated", "hospital",
				hospital.getId(), Map.of());
		return hospital;
	}

	@Override
	public Channels channelsFor(UUID userId) {
		return hospitals.findByUserId(userId)
			.map(h -> new Channels(h.isEmailNotificationsEnabled(), h.isSmsNotificationsEnabled(), h.getPhone()))
			.orElse(null);
	}

	// ── Validation ──────────────────────────────────────────────────────────

	/** The contact email is always the login email. */
	private Hospital.BasicInfo basicInfo(CurrentUser user, BasicInput b) {
		String registration = identifier(b.registrationNumber(), "invalid_registration_number",
				"Registration number must be 4–20 letters, numbers or hyphens.");
		String abn = b.abnNumber() == null ? "" : b.abnNumber().replaceAll("\\s", "");
		if (!isValidAbn(abn)) {
			throw ApiException.badRequest("invalid_abn", "Enter a valid ABN (11 digits).");
		}
		return new Hospital.BasicInfo(b.name().trim(), registration, abn, b.phone().trim(), user.email(),
				b.country().trim(), b.city().trim(), b.address().trim(), b.zipCode().trim());
	}

	private Hospital.Details details(DetailsInput d) {
		if (d.registrationType() == null || !TYPES.contains(d.registrationType())) {
			throw ApiException.badRequest("invalid_hospital_type", "Select a hospital type.");
		}
		List<String> list = clean(d.specialties());
		if (list.isEmpty()) {
			throw ApiException.badRequest("at_least_one_specialty_required", "Select at least one specialty.");
		}
		for (String s : list) {
			if (!specialties.existsByNameAndActiveTrue(s)) {
				throw ApiException.badRequest("invalid_specialty", "Unknown specialty: " + s);
			}
		}
		List<String> rooms = clean(d.roomTypes());
		if (rooms.isEmpty()) {
			throw ApiException.badRequest("room_types_required", "Add at least one room type.");
		}
		if (d.bedCount() == null || d.bedCount() < 1) {
			throw ApiException.badRequest("invalid_bed_count", "Number of beds must be greater than 0.");
		}
		String license = identifier(d.licenseNumber(), "invalid_license_number",
				"License number must be 4–20 letters, numbers or hyphens.");
		return new Hospital.Details(d.registrationType(), list.toArray(String[]::new), d.bedCount(),
				rooms.toArray(String[]::new), license, d.accreditationBody().trim());
	}

	/** Licence and registration certificate are required on first registration; resubmissions keep earlier files. */
	private String certificates(CurrentUser user, RegistrationFiles files, List<RegistrationDocument> existing,
			boolean newRegistration) {
		if (newRegistration && (isEmpty(files.hospitalLicense()) || isEmpty(files.registrationCertificate()))) {
			throw ApiException.badRequest("documents_required",
					"Upload the hospital license and the registration certificate.");
		}
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
		store(user, files.hospitalLicense(), "license").ifPresent(d -> byCategory.put(d.category(), d));
		store(user, files.registrationCertificate(), "registration_certificate")
			.ifPresent(d -> byCategory.put(d.category(), d));
		if (files.otherDocuments() != null) {
			for (MultipartFile f : files.otherDocuments()) {
				store(user, f, "other").ifPresent(others::add);
			}
		}
		List<RegistrationDocument> all = new ArrayList<>(byCategory.values());
		all.addAll(others);
		if (all.isEmpty()) {
			throw ApiException.badRequest("documents_required", "At least one document is required.");
		}
		return json.writeValueAsString(all);
	}

	private Optional<RegistrationDocument> store(CurrentUser user, MultipartFile file, String category) {
		if (isEmpty(file)) {
			return Optional.empty();
		}
		Uploads.ValidatedUpload upload = Uploads.validate(file, Uploads.DOCUMENT_MAX_BYTES, FileType.DOCUMENTS);
		String path = "registration-documents/%s/%s%s".formatted(user.id(), UUID.randomUUID(),
				upload.type().extension());
		storage.store(path, new ByteArrayInputStream(upload.content()));
		String name = upload.originalName() != null && !upload.originalName().isBlank() ? upload.originalName()
				: category + upload.type().extension();
		return Optional.of(new RegistrationDocument(name, path, upload.type().mimeType(), upload.content().length,
				category));
	}

	private static String identifier(String value, String code, String message) {
		String v = value == null ? "" : value.trim().toUpperCase(Locale.ROOT);
		if (!IDENTIFIER.matcher(v).matches()) {
			throw ApiException.badRequest(code, message);
		}
		return v;
	}

	/** Australian Business Number checksum (weighted modulus 89). */
	static boolean isValidAbn(String value) {
		if (value == null || !value.matches("\\d{11}")) {
			return false;
		}
		int[] weights = { 10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19 };
		int total = 0;
		for (int i = 0; i < 11; i++) {
			int digit = value.charAt(i) - '0';
			if (i == 0) {
				digit -= 1;
			}
			total += digit * weights[i];
		}
		return total % 89 == 0;
	}

	private static List<String> clean(List<String> values) {
		return values == null ? List.of()
				: values.stream().filter(s -> s != null && !s.isBlank()).map(String::trim).distinct().toList();
	}

	private static boolean isEmpty(MultipartFile file) {
		return file == null || file.isEmpty();
	}

	public record BasicInput(String name, String registrationNumber, String abnNumber, String phone, String country,
			String city, String address, String zipCode) {
	}

	public record DetailsInput(String registrationType, List<String> specialties, Integer bedCount,
			List<String> roomTypes, String licenseNumber, String accreditationBody) {
	}

	public record RegistrationInput(BasicInput basic, DetailsInput details) {
	}

	public record RegistrationFiles(MultipartFile hospitalLicense, MultipartFile registrationCertificate,
			List<MultipartFile> otherDocuments) {
	}

	public record RegistrationDocument(String fileName, String filePath, String mimeType, long fileSizeBytes,
			String category) {
	}

}
