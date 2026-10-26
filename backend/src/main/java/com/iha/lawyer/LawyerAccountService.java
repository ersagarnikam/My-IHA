package com.iha.lawyer;

import java.io.ByteArrayInputStream;
import java.time.LocalDate;
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
import com.iha.common.Abn;
import com.iha.common.ApiException;
import com.iha.common.AustralianTimeZones;
import com.iha.notification.AlertPreferences;
import com.iha.provider.Lawyer;
import com.iha.provider.LawyerRepository;
import com.iha.providerchat.ProviderAccount;
import com.iha.providerchat.ProviderMessageService;
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
 * Visa lawyer accounts (ported from {@code register_lawyer},
 * {@code resubmit_lawyer_registration}, {@code update_lawyer_basic_info} /
 * {@code update_lawyer_professional_details} and the dashboard layout's
 * approval gate), with the Australian credential: a MARN or a practising
 * certificate. Lawyers aren't charged fees yet.
 */
@Service
public class LawyerAccountService implements AlertPreferences {

	static final Set<String> TYPES = Set.of(Lawyer.INDIVIDUAL, Lawyer.LAW_FIRM);

	static final Set<String> CREDENTIALS = Set.of(Lawyer.MARN, Lawyer.PRACTISING_CERTIFICATE);

	/** States and territories that issue practising certificates. */
	static final Set<String> STATES = Set.of("ACT", "NSW", "NT", "QLD", "SA", "TAS", "VIC", "WA");

	/** A MARN is 7 digits. */
	private static final Pattern MARN = Pattern.compile("\\d{7}");

	/** Practising certificate numbers: 4–20 letters, digits or hyphens. */
	private static final Pattern IDENTIFIER = Pattern.compile("[A-Za-z0-9-]{4,20}");

	private final LawyerRepository lawyers;
	private final AuthService authService;
	private final ProviderMessageService providerMessages;
	private final StorageService storage;
	private final AuditService audit;
	private final JsonMapper json;

	LawyerAccountService(LawyerRepository lawyers, AuthService authService, ProviderMessageService providerMessages,
			StorageService storage, AuditService audit, JsonMapper json) {
		this.lawyers = lawyers;
		this.authService = authService;
		this.providerMessages = providerMessages;
		this.storage = storage;
		this.audit = audit;
		this.json = json;
	}

	// ── Sign-up and registration ────────────────────────────────────────────

	/** Step 1 of the wizard: the login. The lawyer profile follows once the email is verified. */
	@Transactional
	public AppUser createAccount(String email, String password) {
		AppUser user = authService.createAccount(email, password, Role.LAWYER);
		audit.record(user.getId(), user.getEmail(), "lawyer", "auth.registered", "user", user.getId(), Map.of());
		return user;
	}

	@Transactional
	public Lawyer register(CurrentUser user, RegistrationInput input, RegistrationFiles files) {
		if (lawyers.findByUserId(user.id()).isPresent()) {
			throw ApiException.conflict("already_registered", "You have already submitted your registration.");
		}
		Lawyer lawyer = Lawyer.registered(user.id(), input.profile().name().trim());
		lawyer.applyRegistration(profile(user, input.profile()), credential(input.credential()),
				certificates(user, files, List.of(), true));
		lawyer.setTimeZone(input.profile().timeZone());
		lawyer = lawyers.save(lawyer);
		providerMessages.ensureThread(account(lawyer));
		audit.record(user.id(), user.email(), "lawyer", "registration.lawyer_submitted", "lawyer", lawyer.getId(),
				Map.of("credential", lawyer.getCredentialType()));
		return lawyer;
	}

	/** Only after MTA rejected the registration or asked for more information. */
	@Transactional
	public Lawyer resubmit(CurrentUser user, RegistrationInput input, RegistrationFiles files) {
		Lawyer lawyer = requireCurrent(user);
		if (!lawyer.canResubmit()) {
			throw ApiException.conflict("not_resubmittable", "Your registration is not awaiting changes.");
		}
		lawyer.applyRegistration(profile(user, input.profile()), credential(input.credential()),
				certificates(user, files, documents(lawyer), false));
		if (input.profile().timeZone() != null) {
			lawyer.setTimeZone(input.profile().timeZone());
		}
		audit.record(user.id(), user.email(), "lawyer", "registration.resubmitted", "lawyer", lawyer.getId(), Map.of());
		return lawyer;
	}

	// ── The signed-in lawyer ────────────────────────────────────────────────

	@Transactional(readOnly = true)
	public Optional<Lawyer> find(CurrentUser user) {
		return lawyers.findByUserId(user.id());
	}

	/** Any registered lawyer (pending ones too: the gate page needs the status). */
	@Transactional(readOnly = true)
	public Lawyer requireCurrent(CurrentUser user) {
		return lawyers.findByUserId(user.id())
			.orElseThrow(() -> ApiException.forbidden("lawyer_profile_missing", "Complete your registration first."));
	}

	/** Approved by MTA; required for everything past the gate. */
	@Transactional(readOnly = true)
	public Lawyer requireApproved(CurrentUser user) {
		Lawyer lawyer = requireCurrent(user);
		if (!lawyer.isApproved()) {
			throw ApiException.forbidden("lawyer_not_approved", "Your registration is awaiting MTA approval.");
		}
		return lawyer;
	}

	public ProviderAccount account(Lawyer lawyer) {
		return new ProviderAccount(ProviderAccount.LAWYER, lawyer.getId(), lawyer.getUserId());
	}

	public List<RegistrationDocument> documents(Lawyer lawyer) {
		return json.readValue(lawyer.getCertificates(), new TypeReference<List<RegistrationDocument>>() {
		});
	}

	@Transactional(readOnly = true)
	public Resource loadDocument(CurrentUser user, int index) {
		return loadDocument(requireCurrent(user), index);
	}

	/** For MTA admin reviewing a registration. */
	@Transactional(readOnly = true)
	public Resource loadDocument(Lawyer lawyer, int index) {
		List<RegistrationDocument> docs = documents(lawyer);
		if (index < 0 || index >= docs.size()) {
			throw ApiException.notFound("Document not found.");
		}
		return storage.load(docs.get(index).filePath());
	}

	// ── Account settings ────────────────────────────────────────────────────

	@Transactional
	public Lawyer updateProfile(CurrentUser user, ProfileInput input) {
		Lawyer lawyer = requireApproved(user);
		lawyer.updateProfile(profile(user, input));
		if (input.timeZone() != null) {
			lawyer.setTimeZone(input.timeZone());
		}
		audit.record(user.id(), user.email(), "lawyer", "lawyer.profile_updated", "lawyer", lawyer.getId(), Map.of());
		return lawyer;
	}

	/** A renewed or changed credential; MTA re-checks it (the latest check stays on record). */
	@Transactional
	public Lawyer updateCredential(CurrentUser user, CredentialInput input) {
		Lawyer lawyer = requireApproved(user);
		lawyer.updateCredential(credential(input));
		audit.record(user.id(), user.email(), "lawyer", "lawyer.professional_details_updated", "lawyer",
				lawyer.getId(), Map.of("credential", lawyer.getCredentialType()));
		return lawyer;
	}

	@Transactional
	public Lawyer updateNotificationPreferences(CurrentUser user, boolean email, boolean sms) {
		Lawyer lawyer = requireApproved(user);
		lawyer.setNotificationPreferences(email, sms);
		audit.record(user.id(), user.email(), "lawyer", "lawyer.notification_preferences_updated", "lawyer",
				lawyer.getId(), Map.of());
		return lawyer;
	}

	@Override
	public Channels channelsFor(UUID userId) {
		return lawyers.findByUserId(userId)
			.map(l -> new Channels(l.isEmailNotificationsEnabled(), l.isSmsNotificationsEnabled(), l.getPhone()))
			.orElse(null);
	}

	// ── Validation ──────────────────────────────────────────────────────────

	/** The contact email is always the login email. */
	private Lawyer.Profile profile(CurrentUser user, ProfileInput p) {
		if (p.lawyerType() == null || !TYPES.contains(p.lawyerType())) {
			throw ApiException.badRequest("invalid_lawyer_type", "Choose individual lawyer or law firm.");
		}
		String abn = Abn.normalize(p.abnNumber());
		if (!Abn.isValid(abn)) {
			throw ApiException.badRequest("invalid_abn", "Enter a valid ABN (11 digits).");
		}
		return new Lawyer.Profile(p.lawyerType(), p.name().trim(), abn, user.email(), p.phone().trim(),
				p.address().trim(), p.city().trim(), p.zipCode().trim(), blankToNull(p.experience()));
	}

	private static Lawyer.Credential credential(CredentialInput c) {
		if (c.type() == null || !CREDENTIALS.contains(c.type())) {
			throw ApiException.badRequest("invalid_credential_type",
					"Choose registered migration agent (MARN) or Australian legal practitioner.");
		}
		String number = c.number() == null ? "" : c.number().replace(" ", "").trim().toUpperCase(Locale.ROOT);
		String state = null;
		if (Lawyer.MARN.equals(c.type())) {
			if (!MARN.matcher(number).matches()) {
				throw ApiException.badRequest("invalid_marn", "A MARN is 7 digits.");
			}
		}
		else {
			if (!IDENTIFIER.matcher(number).matches()) {
				throw ApiException.badRequest("invalid_practising_certificate",
						"Practising certificate number must be 4–20 letters, numbers or hyphens.");
			}
			state = c.practisingState() == null ? "" : c.practisingState().trim().toUpperCase(Locale.ROOT);
			if (!STATES.contains(state)) {
				throw ApiException.badRequest("invalid_practising_state",
						"Choose the state or territory that issued your practising certificate.");
			}
		}
		if (c.expiresOn() == null || c.expiresOn().isBefore(LocalDate.now(AustralianTimeZones.zone(null)))) {
			throw ApiException.badRequest("invalid_credential_expiry",
					"Enter the expiry date of your current registration or certificate.");
		}
		return new Lawyer.Credential(c.type(), number, state, c.expiresOn());
	}

	/** The credential certificate is required on first registration; resubmissions keep earlier files. */
	private String certificates(CurrentUser user, RegistrationFiles files, List<RegistrationDocument> existing,
			boolean newRegistration) {
		if (newRegistration && isEmpty(files.credentialCertificate())) {
			throw ApiException.badRequest("documents_required",
					"Upload your MARN registration or practising certificate.");
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
		store(user, files.credentialCertificate(), "credential_certificate")
			.ifPresent(d -> byCategory.put(d.category(), d));
		store(user, files.indemnityInsurance(), "indemnity_insurance").ifPresent(d -> byCategory.put(d.category(), d));
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

	private static String blankToNull(String value) {
		return value == null || value.isBlank() ? null : value.trim();
	}

	private static boolean isEmpty(MultipartFile file) {
		return file == null || file.isEmpty();
	}

	/** {@code timeZone}: one of {@link AustralianTimeZones#SUPPORTED}; null keeps the current one. */
	public record ProfileInput(String lawyerType, String name, String abnNumber, String phone, String address,
			String city, String zipCode, String experience, String timeZone) {
	}

	/** {@code practisingState} only for a practising certificate. */
	public record CredentialInput(String type, String number, String practisingState, LocalDate expiresOn) {
	}

	public record RegistrationInput(ProfileInput profile, CredentialInput credential) {
	}

	public record RegistrationFiles(MultipartFile credentialCertificate, MultipartFile indemnityInsurance,
			List<MultipartFile> otherDocuments) {
	}

	public record RegistrationDocument(String fileName, String filePath, String mimeType, long fileSizeBytes,
			String category) {
	}

}
