package com.iha.lawyer;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import com.iha.auth.AppUser;
import com.iha.auth.CurrentUser;
import com.iha.common.validation.PhoneNumber;
import com.iha.common.validation.StrongPassword;
import com.iha.hospital.HospitalAccountController;
import com.iha.privacy.Consent;
import com.iha.privacy.ConsentService;
import com.iha.provider.Lawyer;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.springframework.core.io.Resource;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
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

/** Visa lawyer sign-up, registration, the approval gate and account settings. */
@RestController
public class LawyerAccountController {

	private final LawyerAccountService accounts;
	private final ConsentService consents;

	LawyerAccountController(LawyerAccountService accounts, ConsentService consents) {
		this.accounts = accounts;
		this.consents = consents;
	}

	/** Step 1: the login. A 6-digit code is emailed; {@code POST /api/auth/verify} then signs the lawyer in. */
	@PostMapping("/api/auth/register/lawyer")
	@ResponseStatus(HttpStatus.ACCEPTED)
	public SignUpResponse signUp(@Valid @RequestBody SignUpRequest request) {
		ConsentService.require(request.acceptTerms(), null, false);
		AppUser user = accounts.createAccount(request.email(), request.password());
		consents.record(user.getId(), Consent.TERMS_AND_PRIVACY);
		return new SignUpResponse(user.getEmail());
	}

	/** Where the signed-in lawyer stands: not registered, pending review, or approved. */
	@GetMapping("/api/lawyer/account")
	public AccountResponse account(@AuthenticationPrincipal Jwt jwt) {
		return accounts.find(CurrentUser.from(jwt))
			.map(l -> new AccountResponse(true, profile(l)))
			.orElse(new AccountResponse(false, null));
	}

	@PostMapping(path = "/api/lawyer/registration", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	public ProfileResponse register(@AuthenticationPrincipal Jwt jwt, @Valid @ModelAttribute RegistrationForm form) {
		return profile(accounts.register(CurrentUser.from(jwt), form.input(), form.files()));
	}

	@PutMapping(path = "/api/lawyer/registration", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	public ProfileResponse resubmit(@AuthenticationPrincipal Jwt jwt, @Valid @ModelAttribute RegistrationForm form) {
		return profile(accounts.resubmit(CurrentUser.from(jwt), form.input(), form.files()));
	}

	@GetMapping("/api/lawyer/registration/documents/{index}")
	public ResponseEntity<Resource> registrationDocument(@AuthenticationPrincipal Jwt jwt, @PathVariable int index) {
		return HospitalAccountController.inline(accounts.loadDocument(CurrentUser.from(jwt), index));
	}

	@PutMapping("/api/lawyer/profile")
	public ProfileResponse updateProfile(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ProfileRequest r) {
		return profile(accounts.updateProfile(CurrentUser.from(jwt), r.input()));
	}

	@PutMapping("/api/lawyer/profile/credential")
	public ProfileResponse updateCredential(@AuthenticationPrincipal Jwt jwt, @RequestBody CredentialRequest r) {
		return profile(accounts.updateCredential(CurrentUser.from(jwt), new LawyerAccountService.CredentialInput(
				r.credentialType(), r.credentialNumber(), r.practisingState(), r.credentialExpiresOn())));
	}

	@PutMapping("/api/lawyer/profile/notification-preferences")
	public ProfileResponse updateNotifications(@AuthenticationPrincipal Jwt jwt,
			@RequestBody NotificationPreferencesRequest r) {
		return profile(accounts.updateNotificationPreferences(CurrentUser.from(jwt), r.emailNotificationsEnabled(),
				r.smsNotificationsEnabled()));
	}

	ProfileResponse profile(Lawyer l) {
		List<LawyerAccountService.RegistrationDocument> docs = accounts.documents(l);
		return new ProfileResponse(l.getId(), l.getStatus(), l.isApproved(), l.getRejectionReason(),
				l.getMoreInfoMessage(), l.getLawyerType(), l.getName(), l.getAbnNumber(), l.getContactEmail(),
				l.getPhone(), l.getAddress(), l.getCity(), l.getZipCode(), l.getExperience(), l.getCredentialType(),
				l.getCredentialNumber(), l.getPractisingState(), l.getCredentialExpiresOn(),
				l.isEmailNotificationsEnabled(), l.isSmsNotificationsEnabled(), l.getTimeZone(), l.getCreatedAt(),
				IntStream.range(0, docs.size())
					.mapToObj(i -> new DocumentResponse(i, docs.get(i).fileName(), docs.get(i).category(),
							docs.get(i).mimeType(), docs.get(i).fileSizeBytes()))
					.toList());
	}

	public record SignUpRequest(@NotBlank @Email String email, @StrongPassword String password, Boolean acceptTerms) {
	}

	public record SignUpResponse(String email) {
	}

	/**
	 * Multipart form for registration and resubmission. On resubmission every
	 * file is optional and earlier documents are kept unless replaced.
	 */
	public record RegistrationForm(@NotBlank(message = "Choose individual or law firm") String lawyerType,
			@NotBlank @Size(min = 2, max = 160, message = "Name must be at least 2 characters") String name,
			@NotBlank(message = "ABN is required") String abnNumber, @PhoneNumber String phone,
			@NotBlank(message = "Address is required") @Size(max = 300) String address,
			@NotBlank(message = "City/State is required") @Size(max = 120) String city,
			@NotBlank(message = "Postcode is required") @Size(max = 20) String zipCode,
			@Size(max = 1000) String experience, String timeZone,
			@NotBlank(message = "Choose your credential") String credentialType,
			@NotBlank(message = "Enter your MARN or practising certificate number") String credentialNumber,
			String practisingState,
			@NotNull(message = "Expiry date is required") @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate credentialExpiresOn,
			MultipartFile credentialCertificate, MultipartFile indemnityInsurance, List<MultipartFile> otherDocuments) {

		LawyerAccountService.RegistrationInput input() {
			return new LawyerAccountService.RegistrationInput(
					new LawyerAccountService.ProfileInput(lawyerType, name, abnNumber, phone, address, city, zipCode,
							experience, timeZone),
					new LawyerAccountService.CredentialInput(credentialType, credentialNumber, practisingState,
							credentialExpiresOn));
		}

		LawyerAccountService.RegistrationFiles files() {
			return new LawyerAccountService.RegistrationFiles(credentialCertificate, indemnityInsurance,
					otherDocuments);
		}

	}

	public record ProfileRequest(@NotBlank(message = "Choose individual or law firm") String lawyerType,
			@NotBlank @Size(min = 2, max = 160, message = "Name must be at least 2 characters") String name,
			@NotBlank(message = "ABN is required") String abnNumber, @PhoneNumber String phone,
			@NotBlank(message = "Address is required") @Size(max = 300) String address,
			@NotBlank(message = "City/State is required") @Size(max = 120) String city,
			@NotBlank(message = "Postcode is required") @Size(max = 20) String zipCode,
			@Size(max = 1000) String experience, String timeZone) {

		LawyerAccountService.ProfileInput input() {
			return new LawyerAccountService.ProfileInput(lawyerType, name, abnNumber, phone, address, city, zipCode,
					experience, timeZone);
		}

	}

	public record CredentialRequest(String credentialType, String credentialNumber, String practisingState,
			LocalDate credentialExpiresOn) {
	}

	public record NotificationPreferencesRequest(boolean emailNotificationsEnabled, boolean smsNotificationsEnabled) {
	}

	public record AccountResponse(boolean registered, ProfileResponse lawyer) {
	}

	public record DocumentResponse(int index, String fileName, String category, String mimeType, long fileSizeBytes) {
	}

	public record ProfileResponse(UUID id, String status, boolean approved, String rejectionReason,
			String moreInfoMessage, String lawyerType, String name, String abnNumber, String contactEmail,
			String phone, String address, String city, String zipCode, String experience, String credentialType,
			String credentialNumber, String practisingState, LocalDate credentialExpiresOn,
			boolean emailNotificationsEnabled, boolean smsNotificationsEnabled, String timeZone, Instant createdAt,
			List<DocumentResponse> documents) {
	}

}
