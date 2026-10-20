package com.iha.visa;

import java.time.LocalDate;
import java.time.format.DateTimeParseException;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.regex.Pattern;

import com.iha.common.FieldValidationException;
import com.iha.common.validation.PhoneNumber;
import tools.jackson.databind.PropertyNamingStrategies;
import tools.jackson.databind.annotation.JsonNaming;

/**
 * The subclass 602 application form. JSON keys are snake_case, matching the old
 * {@code form_data} and the translation keys. {@link #validate()} ports
 * {@code getVisaFormSchema} plus the wizard's per-step conditional rules.
 */
@JsonNaming(PropertyNamingStrategies.SnakeCaseStrategy.class)
public record VisaForm(
		// Step 0: traveller
		String firstName, String lastName, String gender, String nationality, String dateOfBirth,
		String australianProviderDetails, String passportNumber, String passportExpiry, String email, String phone,
		// Step 1: medical
		String conditionSummary, String hasMedicalConditions, String medicalConditionsDetails,
		String healthExaminationCompleted,
		// Step 2: Australian provider
		String providerName, String providerOrganization, String providerAddress, String providerContact,
		// Step 3: financial
		String sourceOfFunds, String bankBalance, String sponsorName, String sponsorRelationship, String sponsorContact,
		// Step 4: travel
		String arrivalDate, String departureDate, String purposeOfVisit, String flightBooking, String accommodation,
		// Step 6: legal
		String criminalRecord, String criminalRecordDetails, String previousVisaIssues, String previousVisaIssuesDetails,
		// Step 7: companion
		String travellingWithCompanion, String companionName, String companionRelationship,
		String companionPassportNumber, String companionPassportExpiry) {

	static final String SELF_FUNDED = "Self-Funded";
	static final String FAMILY_SPONSORED = "Family Sponsored";
	static final String EMPLOYER_SPONSORED = "Employer Sponsored";
	static final String YES = "Yes";

	private static final Pattern PASSPORT = Pattern.compile("^[A-Z0-9]{5,12}$", Pattern.CASE_INSENSITIVE);
	private static final Pattern EMAIL = Pattern.compile("^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$");

	void validate() {
		Map<String, String> errors = new LinkedHashMap<>();
		LocalDate today = LocalDate.now();

		require(errors, "first_name", firstName, "First name is required");
		require(errors, "last_name", lastName, "Last name is required");
		require(errors, "gender", gender, "Gender is required");
		require(errors, "nationality", nationality, "Nationality is required");
		LocalDate dob = date(errors, "date_of_birth", dateOfBirth, "Date of birth is required");
		if (dob != null && (!dob.isBefore(today) || dob.isBefore(today.minusYears(120)))) {
			errors.put("date_of_birth", "Please enter a valid date of birth");
		}
		if (require(errors, "passport_number", passportNumber, "Passport number is required")
				&& !PASSPORT.matcher(passportNumber.trim()).matches()) {
			errors.put("passport_number", "Please enter a valid passport number");
		}
		LocalDate expiry = date(errors, "passport_expiry", passportExpiry, "Passport expiry is required");
		if (expiry != null && !expiry.isAfter(today)) {
			errors.put("passport_expiry", "Passport expiry must be a future date");
		}
		if (email == null || !EMAIL.matcher(email.trim()).matches()) {
			errors.put("email", "Please enter a valid email address");
		}
		if (phone == null || !PhoneNumber.Validator.isValid(phone)) {
			errors.put("phone", "Please enter a valid phone number");
		}

		require(errors, "has_medical_conditions", hasMedicalConditions, "Please answer this question");
		require(errors, "health_examination_completed", healthExaminationCompleted, "Please answer this question");
		if (YES.equals(hasMedicalConditions)) {
			require(errors, "medical_conditions_details", medicalConditionsDetails, "Please describe your medical conditions");
		}

		require(errors, "provider_name", providerName, "Provider name is required");
		require(errors, "provider_organization", providerOrganization, "Organization is required");
		require(errors, "provider_address", providerAddress, "Address is required");
		if (require(errors, "provider_contact", providerContact, "Contact is required")
				&& !PhoneNumber.Validator.isValid(providerContact)) {
			errors.put("provider_contact", "Please enter a valid phone number");
		}

		if (require(errors, "source_of_funds", sourceOfFunds, "Source of funds is required")) {
			if (SELF_FUNDED.equals(sourceOfFunds)) {
				require(errors, "bank_balance", bankBalance, "This field is required");
			}
			else if (FAMILY_SPONSORED.equals(sourceOfFunds) || EMPLOYER_SPONSORED.equals(sourceOfFunds)) {
				require(errors, "sponsor_name", sponsorName, "This field is required");
				require(errors, "sponsor_relationship", sponsorRelationship, "This field is required");
				if (require(errors, "sponsor_contact", sponsorContact, "This field is required")
						&& !PhoneNumber.Validator.isValid(sponsorContact)) {
					errors.put("sponsor_contact", "Please enter a valid phone number");
				}
			}
		}

		LocalDate arrival = date(errors, "arrival_date", arrivalDate, "Arrival date is required");
		if (arrival != null && arrival.isBefore(today)) {
			errors.put("arrival_date", "Arrival date must be today or a future date");
		}
		LocalDate departure = date(errors, "departure_date", departureDate, "Departure date is required");
		if (arrival != null && departure != null && !departure.isAfter(arrival)) {
			errors.put("departure_date", "Departure date must be after the arrival date");
		}

		require(errors, "criminal_record", criminalRecord, "Please answer this question");
		require(errors, "previous_visa_issues", previousVisaIssues, "Please answer this question");
		if (YES.equals(criminalRecord)) {
			require(errors, "criminal_record_details", criminalRecordDetails, "Please provide details");
		}
		if (YES.equals(previousVisaIssues)) {
			require(errors, "previous_visa_issues_details", previousVisaIssuesDetails, "Please provide details");
		}

		if (YES.equals(travellingWithCompanion)) {
			require(errors, "companion_name", companionName, "This field is required");
			require(errors, "companion_relationship", companionRelationship, "This field is required");
			if (require(errors, "companion_passport_number", companionPassportNumber, "This field is required")
					&& !PASSPORT.matcher(companionPassportNumber.trim()).matches()) {
				errors.put("companion_passport_number", "Please enter a valid passport number");
			}
			require(errors, "companion_passport_expiry", companionPassportExpiry, "This field is required");
		}

		if (!errors.isEmpty()) {
			throw new FieldValidationException(errors);
		}
	}

	private static boolean require(Map<String, String> errors, String field, String value, String message) {
		if (value == null || value.isBlank()) {
			errors.putIfAbsent(field, message);
			return false;
		}
		return true;
	}

	private static LocalDate date(Map<String, String> errors, String field, String value, String requiredMessage) {
		if (!require(errors, field, value, requiredMessage)) {
			return null;
		}
		try {
			return LocalDate.parse(value.trim());
		}
		catch (DateTimeParseException ex) {
			errors.put(field, "Please enter a valid date");
			return null;
		}
	}

}
