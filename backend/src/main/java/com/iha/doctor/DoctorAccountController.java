package com.iha.doctor;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import com.iha.auth.CurrentUser;
import com.iha.common.AustralianTimeZones;
import com.iha.common.validation.PhoneNumber;
import com.iha.common.validation.StrongPassword;
import com.iha.provider.Doctor;
import com.iha.provider.Hospital;
import com.iha.privacy.Consent;
import com.iha.privacy.ConsentService;
import com.iha.auth.AppUser;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Size;

import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Doctor sign-up, registration, the approval/fee gate and account settings. */
@RestController
public class DoctorAccountController {

	private final ConsentService consents;
	private final DoctorAccountService accounts;

	DoctorAccountController(DoctorAccountService accounts, ConsentService consents) {
		this.consents = consents;
		this.accounts = accounts;
	}

	/** Step 1: the login. A 6-digit code is emailed; {@code POST /api/auth/verify} then signs the doctor in. */
	@PostMapping("/api/auth/register/doctor")
	@ResponseStatus(HttpStatus.ACCEPTED)
	public SignUpResponse signUp(@Valid @RequestBody SignUpRequest request) {
		ConsentService.require(request.acceptTerms(), null, false);
		AppUser user = accounts.createAccount(request.email(), request.password());
		consents.record(user.getId(), Consent.TERMS_AND_PRIVACY);
		return new SignUpResponse(user.getEmail());
	}

	/** Where the signed-in doctor stands: not registered, pending, approved without fee, or active. */
	@GetMapping("/api/doctor/account")
	public AccountResponse account(@AuthenticationPrincipal Jwt jwt) {
		CurrentUser user = CurrentUser.from(jwt);
		return accounts.find(user)
			.map(d -> new AccountResponse(true, profile(d)))
			.orElse(new AccountResponse(false, null));
	}

	/** Approved hospitals to pick affiliations from (registration and settings). */
	@GetMapping("/api/doctor/hospitals")
	public List<HospitalResponse> hospitals() {
		return accounts.approvedHospitals().stream().map(HospitalResponse::of).toList();
	}

	@PostMapping(path = "/api/doctor/registration", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	public ProfileResponse register(@AuthenticationPrincipal Jwt jwt, @Valid @ModelAttribute RegistrationForm form) {
		return profile(accounts.register(CurrentUser.from(jwt), form.input(), form.files()));
	}

	@PutMapping(path = "/api/doctor/registration", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ProfileResponse resubmit(@AuthenticationPrincipal Jwt jwt, @Valid @ModelAttribute RegistrationForm form) {
		return profile(accounts.resubmit(CurrentUser.from(jwt), form.input(), form.files()));
	}

	@GetMapping("/api/doctor/registration/documents/{index}")
	public ResponseEntity<Resource> registrationDocument(@AuthenticationPrincipal Jwt jwt, @PathVariable int index) {
		return inline(accounts.loadDocument(CurrentUser.from(jwt), index));
	}

	@PutMapping("/api/doctor/profile/personal")
	public ProfileResponse updatePersonal(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody PersonalRequest r) {
		return profile(accounts.updatePersonal(CurrentUser.from(jwt), r.fullName(), r.contactPhone(), r.dateOfBirth(),
				r.gender()));
	}

	@PutMapping("/api/doctor/profile/professional")
	public ProfileResponse updateProfessional(@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody ProfessionalRequest r) {
		return profile(accounts.updateProfessional(CurrentUser.from(jwt),
				new DoctorAccountService.ProfessionalInput(r.specialties(), r.qualifications(), r.yearsOfExperience(),
						r.licenseNumber(), r.bio(), r.languagesSpoken(), r.department(), r.role(),
						r.hospitalIds() == null ? List.of() : r.hospitalIds())));
	}

	@PutMapping("/api/doctor/profile/availability")
	public ProfileResponse updateAvailability(@AuthenticationPrincipal Jwt jwt,
			@RequestBody List<DoctorAccountService.AvailabilityDay> days) {
		return profile(accounts.updateAvailability(CurrentUser.from(jwt), days));
	}

	@PutMapping("/api/doctor/profile/time-zone")
	public ProfileResponse updateTimeZone(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody TimeZoneRequest r) {
		return profile(accounts.updateTimeZone(CurrentUser.from(jwt), r.timeZone()));
	}

	@PutMapping("/api/doctor/profile/indemnity")
	public ProfileResponse declareIndemnity(@AuthenticationPrincipal Jwt jwt, @RequestBody IndemnityRequest r) {
		return profile(accounts.declareIndemnity(CurrentUser.from(jwt), new DoctorAccountService.IndemnityInput(
				r.insurer(), r.policyNumber(), r.expiresOn(), r.coversOverseas(), r.telehealthGuidelinesAck())));
	}

	@PutMapping("/api/doctor/profile/notification-preferences")
	public ProfileResponse updateNotifications(@AuthenticationPrincipal Jwt jwt,
			@RequestBody NotificationPreferencesRequest r) {
		return profile(accounts.updateNotificationPreferences(CurrentUser.from(jwt), r.emailNotificationsEnabled(),
				r.smsNotificationsEnabled()));
	}

	@PutMapping("/api/doctor/profile/photo")
	public ProfileResponse updatePhoto(@AuthenticationPrincipal Jwt jwt, @RequestParam("file") MultipartFile file) {
		return profile(accounts.updatePhoto(CurrentUser.from(jwt), file));
	}

	@GetMapping("/api/doctor/profile/photo")
	public ResponseEntity<Resource> photo(@AuthenticationPrincipal Jwt jwt) {
		return inline(accounts.loadPhoto(CurrentUser.from(jwt)));
	}

	private ProfileResponse profile(Doctor d) {
		List<DoctorAccountService.RegistrationDocument> docs = accounts.documents(d);
		return new ProfileResponse(d.getId(), d.getStatus(), d.isActive(), d.getRejectionReason(),
				d.getMoreInfoMessage(), d.getFullName(), d.getContactEmail(), d.getContactPhone(), d.getDateOfBirth(),
				d.getGender(), list(d.getSpecialties()), d.getQualifications(), d.getYearsExperience(),
				d.getLicenseNumber(), d.getPhotoUrl() != null, d.getBio(), list(d.getLanguagesSpoken()),
				d.getDepartment(), d.getRole(), list(d.getWorkingDays()), accounts.hospitalIds(d),
				accounts.availability(d), d.isEmailNotificationsEnabled(), d.isSmsNotificationsEnabled(),
				d.getRegistrationFeePaidAt(), d.getAnnualFeeNextDueAt(), d.getTimeZone(), d.getIndemnity(),
				Doctor.Indemnity.status(d.getIndemnity(), LocalDate.now(AustralianTimeZones.zone(d.getTimeZone()))),
				IntStream.range(0, docs.size())
					.mapToObj(i -> new DocumentResponse(i, docs.get(i).fileName(), docs.get(i).category(),
							docs.get(i).mimeType(), docs.get(i).fileSizeBytes()))
					.toList());
	}

	static ResponseEntity<Resource> inline(Resource resource) {
		return ResponseEntity.ok()
			.contentType(MediaTypeFactory.getMediaType(resource).orElse(MediaType.APPLICATION_OCTET_STREAM))
			.cacheControl(CacheControl.noStore().cachePrivate())
			.body(resource);
	}

	private static List<String> list(String[] values) {
		return values == null ? List.of() : Arrays.asList(values);
	}

	public record SignUpRequest(@NotBlank @Email String email, @StrongPassword String password, Boolean acceptTerms) {
	}

	public record SignUpResponse(String email) {
	}

	/**
	 * Multipart form for registration and resubmission. Lists repeat their
	 * parameter ({@code specialties=A&specialties=B}). On resubmission every
	 * file is optional and earlier documents are kept unless replaced.
	 */
	public record RegistrationForm(
			@NotBlank @Size(min = 2, max = 120, message = "Full name must be at least 2 characters") String fullName,
			@PhoneNumber String contactPhone,
			@NotEmpty(message = "Select at least one specialty") List<String> specialties,
			@NotBlank(message = "Qualifications are required") @Size(max = 500) String qualifications,
			@NotNull @Min(0) @Max(70) Integer yearsOfExperience,
			@NotBlank String licenseNumber,
			@NotBlank(message = "A short professional bio is required") @Size(max = 2000) String bio,
			@NotEmpty(message = "Select at least one language") List<String> languagesSpoken,
			@NotBlank(message = "Department is required") @Size(max = 120) String department,
			@NotBlank(message = "Select a role") String role,
			List<UUID> hospitalIds,
			@NotEmpty(message = "Select at least one working day") List<String> workingDays, String timeZone,
			MultipartFile photo, MultipartFile medicalLicense, MultipartFile degreeCertificate,
			List<MultipartFile> otherDocuments) {

		DoctorAccountService.RegistrationInput input() {
			return new DoctorAccountService.RegistrationInput(fullName, contactPhone, specialties, qualifications,
					yearsOfExperience, licenseNumber, bio, languagesSpoken, department, role,
					hospitalIds == null ? List.of() : hospitalIds, workingDays, timeZone);
		}

		DoctorAccountService.RegistrationFiles files() {
			return new DoctorAccountService.RegistrationFiles(photo, medicalLicense, degreeCertificate, otherDocuments);
		}

	}

	public record PersonalRequest(
			@NotBlank @Size(min = 2, max = 120, message = "Full name must be at least 2 characters") String fullName,
			@PhoneNumber String contactPhone,
			@NotNull(message = "Date of birth is required") @Past LocalDate dateOfBirth,
			@NotBlank(message = "Select a gender") String gender) {
	}

	public record ProfessionalRequest(
			@NotEmpty(message = "Select at least one specialty") List<String> specialties,
			@NotBlank(message = "Qualifications are required") @Size(max = 500) String qualifications,
			@Min(0) @Max(70) int yearsOfExperience,
			@NotBlank String licenseNumber,
			@NotBlank(message = "A short professional bio is required") @Size(max = 2000) String bio,
			@NotEmpty(message = "Select at least one language") List<String> languagesSpoken,
			@NotBlank(message = "Department is required") @Size(max = 120) String department,
			@NotBlank(message = "Select a role") String role,
			List<UUID> hospitalIds) {
	}

	public record NotificationPreferencesRequest(boolean emailNotificationsEnabled, boolean smsNotificationsEnabled) {
	}

	public record TimeZoneRequest(@NotBlank(message = "Choose a time zone") String timeZone) {
	}

	public record AccountResponse(boolean registered, ProfileResponse doctor) {
	}

	public record DocumentResponse(int index, String fileName, String category, String mimeType, long fileSizeBytes) {
	}

	public record ProfileResponse(UUID id, String status, boolean active, String rejectionReason,
			String moreInfoMessage, String fullName, String contactEmail, String contactPhone, LocalDate dateOfBirth,
			String gender, List<String> specialties, String qualifications, Integer yearsOfExperience,
			String licenseNumber, boolean hasPhoto, String bio, List<String> languagesSpoken, String department,
			String role, List<String> workingDays, List<UUID> hospitalIds,
			List<DoctorAccountService.AvailabilityDay> availability, boolean emailNotificationsEnabled,
			boolean smsNotificationsEnabled, Instant registrationFeePaidAt, Instant annualFeeNextDueAt, String timeZone,
			Doctor.Indemnity indemnity, String indemnityStatus, List<DocumentResponse> documents) {
	}

	public record IndemnityRequest(String insurer, String policyNumber, LocalDate expiresOn, boolean coversOverseas,
			boolean telehealthGuidelinesAck) {
	}

	public record HospitalResponse(UUID id, String name, String city, String country, List<String> roomTypes) {

		static HospitalResponse of(Hospital h) {
			return new HospitalResponse(h.getId(), h.getName(), h.getCity(), h.getCountry(), list(h.getRoomTypes()));
		}

	}

}
