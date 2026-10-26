package com.iha.hospital;

import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import com.iha.auth.CurrentUser;
import com.iha.common.validation.PhoneNumber;
import com.iha.common.validation.StrongPassword;
import com.iha.provider.Hospital;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.springframework.core.io.Resource;
import org.springframework.format.annotation.DateTimeFormat;
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
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/** Hospital sign-up, registration, the approval gate and account settings. */
@RestController
public class HospitalAccountController {

	private final HospitalAccountService accounts;

	HospitalAccountController(HospitalAccountService accounts) {
		this.accounts = accounts;
	}

	/** Step 1: the login. A 6-digit code is emailed; {@code POST /api/auth/verify} then signs the hospital in. */
	@PostMapping("/api/auth/register/hospital")
	@ResponseStatus(HttpStatus.ACCEPTED)
	public SignUpResponse signUp(@Valid @RequestBody SignUpRequest request) {
		return new SignUpResponse(accounts.createAccount(request.email(), request.password()).getEmail());
	}

	/** Where the signed-in hospital stands: not registered, pending review, or approved. */
	@GetMapping("/api/hospital/account")
	public AccountResponse account(@AuthenticationPrincipal Jwt jwt) {
		return accounts.find(CurrentUser.from(jwt))
			.map(h -> new AccountResponse(true, profile(h)))
			.orElse(new AccountResponse(false, null));
	}

	@PostMapping(path = "/api/hospital/registration", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	public ProfileResponse register(@AuthenticationPrincipal Jwt jwt, @Valid @ModelAttribute RegistrationForm form) {
		return profile(accounts.register(CurrentUser.from(jwt), form.input(), form.files()));
	}

	@PutMapping(path = "/api/hospital/registration", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ProfileResponse resubmit(@AuthenticationPrincipal Jwt jwt, @Valid @ModelAttribute RegistrationForm form) {
		return profile(accounts.resubmit(CurrentUser.from(jwt), form.input(), form.files()));
	}

	@GetMapping("/api/hospital/registration/documents/{index}")
	public ResponseEntity<Resource> registrationDocument(@AuthenticationPrincipal Jwt jwt, @PathVariable int index) {
		return inline(accounts.loadDocument(CurrentUser.from(jwt), index));
	}

	@PutMapping("/api/hospital/profile/basic")
	public ProfileResponse updateBasic(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody BasicRequest r) {
		return profile(accounts.updateBasicInfo(CurrentUser.from(jwt), r.input()));
	}

	@PutMapping("/api/hospital/profile/details")
	public ProfileResponse updateDetails(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody DetailsRequest r) {
		return profile(accounts.updateDetails(CurrentUser.from(jwt), r.input()));
	}

	@PutMapping("/api/hospital/profile/notification-preferences")
	public ProfileResponse updateNotifications(@AuthenticationPrincipal Jwt jwt,
			@RequestBody NotificationPreferencesRequest r) {
		return profile(accounts.updateNotificationPreferences(CurrentUser.from(jwt), r.emailNotificationsEnabled(),
				r.smsNotificationsEnabled()));
	}

	ProfileResponse profile(Hospital h) {
		List<HospitalAccountService.RegistrationDocument> docs = accounts.documents(h);
		return new ProfileResponse(h.getId(), h.getStatus(), h.isApproved(), h.getRejectionReason(),
				h.getMoreInfoMessage(), h.getName(), h.getRegistrationNumber(), h.getAbnNumber(), h.getPhone(),
				h.getContactEmail(), h.getCountry(), h.getCity(), h.getAddress(), h.getZipCode(),
				h.getRegistrationType(), list(h.getSpecialties()), h.getBedCount(), list(h.getRoomTypes()),
				h.getLicenseNumber(), h.getAccreditationBody(), h.getAccreditationExpiresOn(), h.getLicenceExpiresOn(),
				h.isEmailNotificationsEnabled(),
				h.isSmsNotificationsEnabled(), h.getTimeZone(), h.getCreatedAt(),
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

	static List<String> list(String[] values) {
		return values == null ? List.of() : Arrays.asList(values);
	}

	public record SignUpRequest(@NotBlank @Email String email, @StrongPassword String password) {
	}

	public record SignUpResponse(String email) {
	}

	/**
	 * Multipart form for registration and resubmission. Lists repeat their
	 * parameter ({@code specialties=A&specialties=B}). On resubmission every
	 * file is optional and earlier documents are kept unless replaced.
	 */
	public record RegistrationForm(
			@NotBlank @Size(min = 2, max = 160, message = "Hospital name must be at least 2 characters") String name,
			@NotBlank(message = "Registration number is required") String registrationNumber,
			@NotBlank(message = "ABN is required") String abnNumber,
			@PhoneNumber String phone,
			@NotBlank(message = "Country is required") @Size(max = 80) String country,
			@NotBlank(message = "State/City is required") @Size(max = 120) String city,
			@NotBlank(message = "Full address is required") @Size(max = 300) String address,
			@NotBlank(message = "Zip code is required") @Size(max = 20) String zipCode, String timeZone,
			@NotBlank(message = "Select a hospital type") String registrationType,
			@NotEmpty(message = "Select at least one specialty") List<String> specialties,
			@NotNull(message = "Number of beds is required") @Min(value = 1, message = "Number of beds must be greater than 0") @Max(100000) Integer bedCount,
			@NotEmpty(message = "Add at least one room type") List<String> roomTypes,
			@NotBlank(message = "License number is required") String licenseNumber,
			@NotBlank(message = "Accreditation body is required") @Size(max = 160) String accreditationBody,
			@NotNull(message = "Accreditation expiry is required") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate accreditationExpiresOn,
			@NotNull(message = "Licence expiry is required") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate licenceExpiresOn,
			MultipartFile hospitalLicense, MultipartFile registrationCertificate, List<MultipartFile> otherDocuments) {

		HospitalAccountService.RegistrationInput input() {
			return new HospitalAccountService.RegistrationInput(
					new HospitalAccountService.BasicInput(name, registrationNumber, abnNumber, phone, country, city,
							address, zipCode, timeZone),
					new HospitalAccountService.DetailsInput(registrationType, specialties, bedCount, roomTypes,
							licenseNumber, accreditationBody, accreditationExpiresOn, licenceExpiresOn));
		}

		HospitalAccountService.RegistrationFiles files() {
			return new HospitalAccountService.RegistrationFiles(hospitalLicense, registrationCertificate,
					otherDocuments);
		}

	}

	public record BasicRequest(
			@NotBlank @Size(min = 2, max = 160, message = "Hospital name must be at least 2 characters") String name,
			@NotBlank(message = "Registration number is required") String registrationNumber,
			@NotBlank(message = "ABN is required") String abnNumber, @PhoneNumber String phone,
			@NotBlank(message = "Country is required") @Size(max = 80) String country,
			@NotBlank(message = "State/City is required") @Size(max = 120) String city,
			@NotBlank(message = "Full address is required") @Size(max = 300) String address,
			@NotBlank(message = "Zip code is required") @Size(max = 20) String zipCode, String timeZone) {

		HospitalAccountService.BasicInput input() {
			return new HospitalAccountService.BasicInput(name, registrationNumber, abnNumber, phone, country, city,
					address, zipCode, timeZone);
		}

	}

	public record DetailsRequest(@NotBlank(message = "Select a hospital type") String registrationType,
			@NotEmpty(message = "Select at least one specialty") List<String> specialties,
			@NotNull(message = "Number of beds is required") @Min(value = 1, message = "Number of beds must be greater than 0") @Max(100000) Integer bedCount,
			@NotEmpty(message = "Add at least one room type") List<String> roomTypes,
			@NotBlank(message = "License number is required") String licenseNumber,
			@NotBlank(message = "Accreditation body is required") @Size(max = 160) String accreditationBody,
			@NotNull(message = "Accreditation expiry is required") LocalDate accreditationExpiresOn,
			@NotNull(message = "Licence expiry is required") LocalDate licenceExpiresOn) {

		HospitalAccountService.DetailsInput input() {
			return new HospitalAccountService.DetailsInput(registrationType, specialties, bedCount, roomTypes,
					licenseNumber, accreditationBody, accreditationExpiresOn, licenceExpiresOn);
		}

	}

	public record NotificationPreferencesRequest(boolean emailNotificationsEnabled, boolean smsNotificationsEnabled) {
	}

	public record AccountResponse(boolean registered, ProfileResponse hospital) {
	}

	public record DocumentResponse(int index, String fileName, String category, String mimeType, long fileSizeBytes) {
	}

	public record ProfileResponse(UUID id, String status, boolean approved, String rejectionReason,
			String moreInfoMessage, String name, String registrationNumber, String abnNumber, String phone,
			String contactEmail, String country, String city, String address, String zipCode, String registrationType,
			List<String> specialties, Integer bedCount, List<String> roomTypes, String licenseNumber,
			String accreditationBody, LocalDate accreditationExpiresOn, LocalDate licenceExpiresOn,
			boolean emailNotificationsEnabled, boolean smsNotificationsEnabled,
			String timeZone, Instant createdAt, List<DocumentResponse> documents) {
	}

}
