package com.iha.patient;

import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import com.iha.auth.CurrentUser;
import com.iha.common.validation.PhoneNumber;
import com.iha.common.validation.StrongPassword;
import com.iha.privacy.Consent;
import com.iha.privacy.ConsentService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Past;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaTypeFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
public class PatientController {

	private final PatientService patientService;

	private final ConsentService consents;

	public PatientController(PatientService patientService, ConsentService consents) {
		this.patientService = patientService;
		this.consents = consents;
	}

	@PostMapping("/api/auth/register/patient")
	@ResponseStatus(HttpStatus.ACCEPTED)
	public RegistrationResponse register(@Valid @RequestBody RegisterPatientRequest request) {
		ConsentService.require(request.acceptTerms(), request.consentHealthInfo(), true);
		Patient patient = patientService.register(request.fullName(), request.email(), request.password());
		consents.record(patient.getUserId(), Consent.TERMS_AND_PRIVACY, Consent.HEALTH_INFORMATION);
		return new RegistrationResponse(request.email().trim().toLowerCase(), "verification_required");
	}

	@GetMapping("/api/patient/profile")
	public ProfileResponse profile(@AuthenticationPrincipal Jwt jwt) {
		CurrentUser user = CurrentUser.from(jwt);
		return ProfileResponse.of(patientService.requireCurrent(user), user.email());
	}

	@PutMapping("/api/patient/profile/personal-info")
	public ProfileResponse updatePersonalInfo(@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody PersonalInfoRequest r) {
		CurrentUser user = CurrentUser.from(jwt);
		return ProfileResponse.of(patientService.updatePersonalInfo(user, r.fullName(), r.dateOfBirth(), r.gender(),
				r.nationality(), r.countryOfResidence(), r.phone(), r.address()), user.email());
	}

	@PutMapping("/api/patient/profile/medical-background")
	public ProfileResponse updateMedicalBackground(@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody MedicalBackgroundRequest r) {
		CurrentUser user = CurrentUser.from(jwt);
		return ProfileResponse.of(patientService.updateMedicalBackground(user, r.medicalHistory(), r.allergies(),
				r.currentMedications(), r.pastSurgeries()), user.email());
	}

	@PutMapping("/api/patient/profile/emergency-contact")
	public ProfileResponse updateEmergencyContact(@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody EmergencyContactRequest r) {
		CurrentUser user = CurrentUser.from(jwt);
		return ProfileResponse.of(patientService.updateEmergencyContact(user, r.name(), r.relationship(), r.phone()),
				user.email());
	}

	@PutMapping("/api/patient/profile/notification-preferences")
	public ProfileResponse updateNotificationPreferences(@AuthenticationPrincipal Jwt jwt,
			@Valid @RequestBody NotificationPreferencesRequest r) {
		CurrentUser user = CurrentUser.from(jwt);
		return ProfileResponse.of(patientService.updateNotificationPreferences(user, r.emailNotificationsEnabled(),
				r.smsNotificationsEnabled()), user.email());
	}

	@PutMapping("/api/patient/profile/avatar")
	public ProfileResponse updateAvatar(@AuthenticationPrincipal Jwt jwt, @RequestParam("file") MultipartFile file) {
		CurrentUser user = CurrentUser.from(jwt);
		return ProfileResponse.of(patientService.updateAvatar(user, file), user.email());
	}

	@GetMapping("/api/patient/profile/avatar")
	public ResponseEntity<Resource> avatar(@AuthenticationPrincipal Jwt jwt) {
		Resource avatar = patientService.loadAvatar(CurrentUser.from(jwt));
		return ResponseEntity.ok()
			.contentType(MediaTypeFactory.getMediaType(avatar).orElseThrow())
			.cacheControl(CacheControl.noStore().cachePrivate())
			.body(avatar);
	}

	@DeleteMapping("/api/patient/account")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void deleteAccount(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody DeleteAccountRequest request) {
		patientService.deleteAccount(CurrentUser.from(jwt));
	}

	public record RegisterPatientRequest(
			@NotBlank @Size(min = 2, max = 100, message = "Full name must be 2–100 characters") String fullName,
			@NotBlank @Email String email, @StrongPassword String password, Boolean acceptTerms,
			Boolean consentHealthInfo) {
	}

	public record RegistrationResponse(String email, String status) {
	}

	public record PersonalInfoRequest(
			@NotBlank @Size(min = 2, max = 100) @Pattern(regexp = ".*\\p{L}.*", message = "Full name must contain a letter") String fullName,
			@NotNull(message = "Date of birth is required") @Past(message = "Please enter a valid date of birth") LocalDate dateOfBirth,
			@NotBlank @Pattern(regexp = "male|female|other|prefer_not_to_say", message = "Please select a gender") String gender,
			@NotBlank(message = "Nationality is required") String nationality,
			@NotBlank(message = "Country of residence is required") String countryOfResidence,
			@NotBlank @PhoneNumber String phone,
			@Size(max = 500) String address) {
	}

	public record MedicalBackgroundRequest(@Size(max = 5000) String medicalHistory,
			@Size(max = 20, message = "Maximum 20 items") List<@Size(max = 100) String> allergies,
			@Size(max = 20, message = "Maximum 20 items") List<@Size(max = 100) String> currentMedications,
			@Size(max = 5000) String pastSurgeries) {
	}

	public record EmergencyContactRequest(@NotBlank(message = "Contact name is required") @Size(max = 100) String name,
			@NotBlank(message = "Relationship is required") String relationship, @NotBlank @PhoneNumber String phone) {
	}

	public record NotificationPreferencesRequest(boolean emailNotificationsEnabled, boolean smsNotificationsEnabled) {
	}

	/** The UI asks the user to type DELETE; the API checks it too so a stray request can't delete an account. */
	public record DeleteAccountRequest(@Pattern(regexp = "DELETE", message = "Type DELETE to confirm") String confirm) {
	}

	public record ProfileResponse(UUID id, String email, String fullName, LocalDate dateOfBirth, String gender,
			String nationality, String countryOfResidence, String phone, String address, String medicalHistory,
			List<String> allergies, List<String> currentMedications, String pastSurgeries, String emergencyContactName,
			String emergencyContactRelationship, String emergencyContactPhone, boolean hasAvatar,
			boolean emailNotificationsEnabled, boolean smsNotificationsEnabled, boolean profileComplete,
			Instant createdAt) {

		static ProfileResponse of(Patient p, String email) {
			return new ProfileResponse(p.getId(), email, p.getFullName(), p.getDateOfBirth(), p.getGender(),
					p.getNationality(), p.getCountryOfResidence(), p.getPhone(), p.getAddress(), p.getMedicalHistory(),
					p.getAllergies() == null ? List.of() : p.getAllergies(),
					p.getCurrentMedications() == null ? List.of() : p.getCurrentMedications(), p.getPastSurgeries(),
					p.getEmergencyContactName(), p.getEmergencyContactRelationship(), p.getEmergencyContactPhone(),
					p.getAvatarPath() != null, p.isEmailNotificationsEnabled(), p.isSmsNotificationsEnabled(),
					p.isProfileComplete(), p.getCreatedAt());
		}

	}

}
