package com.iha.dev;

import java.time.LocalDate;
import java.util.List;

import com.iha.auth.AppUser;
import com.iha.auth.AppUserRepository;
import com.iha.auth.CurrentUser;
import com.iha.auth.Role;
import com.iha.cases.CaseService;
import com.iha.cases.MedicalCase;
import com.iha.doctor.DoctorAccountService;
import com.iha.doctor.DoctorAdminService;
import com.iha.doctor.DoctorCaseService;
import com.iha.doctor.DoctorFeeService;
import com.iha.patient.PatientService;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorRepository;
import com.iha.hospital.HospitalAccountService;
import com.iha.hospital.HospitalAdminService;
import com.iha.provider.Hospital;
import com.iha.provider.HospitalRepository;
import com.iha.provider.Lawyer;
import com.iha.lawyer.LawyerAccountService;
import com.iha.lawyer.LawyerAdminService;
import com.iha.verification.ProviderVerification;
import com.iha.verification.VerificationService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

/**
 * DEV PROFILE ONLY. The H2 database starts empty on every restart, so this
 * creates demo accounts (password {@value #PASSWORD}) and a little data to
 * click through: four approved hospitals, a patient with a complete profile,
 * and an active doctor with one new case invitation and one case in evaluation.
 * Everything goes through the real services. Disable with
 * {@code iha.dev.seed-demo-data=false}.
 */
@Profile("dev")
@ConditionalOnProperty(name = "iha.dev.seed-demo-data", havingValue = "true", matchIfMissing = true)
@Component
class DevDataSeeder implements ApplicationRunner {

	static final String PASSWORD = "Demo1234";
	static final String PATIENT_EMAIL = "patient@demo.local";
	static final String DOCTOR_EMAIL = "doctor@demo.local";
	static final String ADMIN_EMAIL = "admin@demo.local";
	static final String HOSPITAL_EMAIL = "hospital@demo.local";
	static final String LAWYER_EMAIL = "lawyer@demo.local";

	private static final Logger log = LoggerFactory.getLogger(DevDataSeeder.class);

	private final AppUserRepository users;
	private final HospitalRepository hospitals;
	private final DoctorRepository doctors;
	private final PatientService patients;
	private final CaseService cases;
	private final DoctorAccountService doctorAccounts;
	private final DoctorAdminService doctorAdmin;
	private final DoctorCaseService doctorCases;
	private final DoctorFeeService doctorFees;
	private final DevHistory history;
	private final HospitalAccountService hospitalAccounts;
	private final HospitalAdminService hospitalAdmin;
	private final org.springframework.security.crypto.password.PasswordEncoder passwordEncoder;
	private final VerificationService verification;
	private final LawyerAccountService lawyerAccounts;
	private final LawyerAdminService lawyerAdmin;
	private final DevVisaCase visaCase;

	DevDataSeeder(AppUserRepository users, HospitalRepository hospitals, DoctorRepository doctors,
			PatientService patients, CaseService cases, DoctorAccountService doctorAccounts,
			DoctorAdminService doctorAdmin, DoctorCaseService doctorCases, DoctorFeeService doctorFees,
			DevHistory history, HospitalAccountService hospitalAccounts, HospitalAdminService hospitalAdmin,
			org.springframework.security.crypto.password.PasswordEncoder passwordEncoder,
			VerificationService verification, LawyerAccountService lawyerAccounts, LawyerAdminService lawyerAdmin,
			DevVisaCase visaCase) {
		this.verification = verification;
		this.lawyerAccounts = lawyerAccounts;
		this.lawyerAdmin = lawyerAdmin;
		this.visaCase = visaCase;
		this.history = history;
		this.hospitalAccounts = hospitalAccounts;
		this.hospitalAdmin = hospitalAdmin;
		this.passwordEncoder = passwordEncoder;
		this.users = users;
		this.hospitals = hospitals;
		this.doctors = doctors;
		this.patients = patients;
		this.cases = cases;
		this.doctorAccounts = doctorAccounts;
		this.doctorAdmin = doctorAdmin;
		this.doctorCases = doctorCases;
		this.doctorFees = doctorFees;
	}

	@Override
	public void run(ApplicationArguments args) {
		if (users.findByEmail(DOCTOR_EMAIL).isPresent()) {
			return;
		}
		List<Hospital> seeded = List.of(
				registeredHospital(),
				hospital("Royal Brisbane and Women's Hospital", "Brisbane"),
				hospital("Royal Melbourne Hospital", "Melbourne"),
				hospital("Fiona Stanley Hospital", "Perth"));

		CurrentUser patient = patient();
		CurrentUser doctor = doctor(seeded);
		Doctor doctorRow = doctors.findByUserId(doctor.id()).orElseThrow();

		MedicalCase invited = cases.submit(patient, "Cardiology", null,
				"Recurring chest tightness and shortness of breath when climbing stairs for the past six months. "
						+ "Local ECG showed irregularities; looking for a specialist opinion on treatment options.",
				List.of("lab_report"), List.of(BytesMultipartFile.pdf("files", "ECG report")));
		doctorAdmin.assignCase(invited.getId(), doctorRow.getId());

		MedicalCase inEvaluation = cases.submit(patient, "Orthopaedics & Joint Replacement", null,
				"Severe right knee pain and stiffness for two years, worse in the mornings. Diagnosed with "
						+ "osteoarthritis locally; physiotherapy has not helped and I am considering knee replacement.",
				List.of("xray", "mri_ct"),
				List.of(BytesMultipartFile.pdf("files", "Knee X-ray"), BytesMultipartFile.pdf("files", "Knee MRI")));
		var assignment = doctorAdmin.assignCase(inEvaluation.getId(), doctorRow.getId());
		doctorCases.respond(doctor, assignment.getId(), "accepted", null);
		doctorCases.startEvaluation(doctor, inEvaluation.getId());

		admin();
		pendingDoctor(seeded);
		pendingHospital();
		history.seed(patient, doctor, seeded,
				(email, name, licence) -> doctor(email, name, licence, List.of("Cardiology"), seeded));
		Lawyer lawyer = lawyer();
		pendingLawyer();
		Hospital stVincents = seeded.get(0);
		visaCase.seed(patient, doctor, new CurrentUser(stVincents.getUserId(), HOSPITAL_EMAIL, Role.HOSPITAL),
				stVincents.getId(), lawyer.getId());

		log.info("Dev demo data ready. Sign in as {}, {}, {}, {} or {} with password {}", PATIENT_EMAIL, DOCTOR_EMAIL,
				HOSPITAL_EMAIL, LAWYER_EMAIL, ADMIN_EMAIL, PASSWORD);
	}

	private Hospital hospital(String name, String city) {
		Hospital hospital = new Hospital(null, name, city, "Australia");
		hospital.setRoomTypes(new String[] { "Standard", "Private", "Deluxe Suite" });
		return hospitals.save(hospital);
	}

	/** St Vincent's, registered through the hospital portal and approved: the hospital demo login. */
	private Hospital registeredHospital() {
		hospitalAccounts.createAccount(HOSPITAL_EMAIL, PASSWORD);
		CurrentUser user = verified(HOSPITAL_EMAIL, Role.HOSPITAL);
		Hospital hospital = hospitalAccounts.register(user, hospitalInput("St Vincent's Hospital Sydney",
				"390 Victoria Street, Darlinghurst", "Sydney", "2010", "+61 2 8382 1111", "HOSP-NSW-0390",
				"LIC-NSW-77812", List.of("Cardiology", "Orthopaedics & Joint Replacement", "Oncology (Cancer Treatment)"), 420,
				"Australia/Sydney"),
				hospitalFiles());
		verification.recordDemoChecks(ProviderVerification.HOSPITAL, hospital.getId());
		return hospitalAdmin.review(null, hospital.getId(), Hospital.APPROVED, null);
	}

	/** A registration waiting in the admin portal's Hospital Approvals. */
	private void pendingHospital() {
		hospitalAccounts.createAccount("pending.hospital@demo.local", PASSWORD);
		CurrentUser user = verified("pending.hospital@demo.local", Role.HOSPITAL);
		hospitalAccounts.register(user, hospitalInput("Gold Coast Private Hospital", "14 Hill Street, Southport",
				"Gold Coast", "4215", "+61 7 5530 0300", "HOSP-QLD-0014", "LIC-QLD-55120",
				List.of("Orthopaedics & Joint Replacement", "General Surgery"), 284, "Australia/Brisbane"), hospitalFiles());
	}

	private static HospitalAccountService.RegistrationInput hospitalInput(String name, String address, String city,
			String zip, String phone, String registration, String licence, List<String> specialties, int beds,
			String timeZone) {
		// 51 824 753 556 is the ATO's published example ABN (valid checksum).
		return new HospitalAccountService.RegistrationInput(
				new HospitalAccountService.BasicInput(name, registration, "51824753556", phone, "Australia", city,
						address, zip, timeZone),
				new HospitalAccountService.DetailsInput(Hospital.MULTI_SPECIALTY, specialties, beds,
						List.of("Standard", "Private", "Deluxe Suite"), licence, "Australian Council on Healthcare Standards",
						LocalDate.now().plusYears(2), LocalDate.now().plusMonths(14)));
	}

	private static HospitalAccountService.RegistrationFiles hospitalFiles() {
		return new HospitalAccountService.RegistrationFiles(BytesMultipartFile.pdf("hospitalLicense", "Hospital license"),
				BytesMultipartFile.pdf("registrationCertificate", "Registration certificate"), List.of());
	}

	private CurrentUser patient() {
		patients.register("Demo Patient", PATIENT_EMAIL, PASSWORD);
		CurrentUser user = verified(PATIENT_EMAIL, Role.PATIENT);
		patients.updatePersonalInfo(user, "Demo Patient", LocalDate.of(1985, 4, 12), "male", "India", "India",
				"+61 412 345 678", "12 Demo Street, Mumbai");
		patients.updateMedicalBackground(user, "Type 2 diabetes, well controlled.", List.of("Penicillin"),
				List.of("Metformin"), "Appendectomy (2010)");
		patients.updateEmergencyContact(user, "Asha Patient", "Spouse", "+61 412 345 679");
		return user;
	}

	/** Dr. Chen works in Sydney (daylight saving); the peers keep the Brisbane default. */
	private CurrentUser doctor(List<Hospital> affiliated) {
		CurrentUser user = doctor(DOCTOR_EMAIL, "Dr. Amelia Chen", "MED0001234560",
				List.of("Cardiology", "Orthopaedics & Joint Replacement"), affiliated);
		doctorAccounts.updateTimeZone(user, "Australia/Sydney");
		return user;
	}

	CurrentUser doctor(String email, String name, String licence, List<String> specialtyNames,
			List<Hospital> affiliated) {
		doctorAccounts.createAccount(email, PASSWORD);
		CurrentUser user = verified(email, Role.DOCTOR);
		Doctor doctor = doctorAccounts.register(user,
				new DoctorAccountService.RegistrationInput(name, "+61 412 555 010", specialtyNames, "MBBS, FRACS", 15,
						licence, "Consultant cardiothoracic and orthopaedic surgeon with 15 years of experience.",
						List.of("English", "Mandarin (Chinese)"), "Surgery", "surgeon",
						affiliated.stream().map(Hospital::getId).toList(), List.of("mon", "tue", "wed", "thu", "fri")),
				new DoctorAccountService.RegistrationFiles(null, BytesMultipartFile.pdf("medicalLicense", "Medical license"),
						BytesMultipartFile.pdf("degreeCertificate", "Degree certificate"), List.of()));
		verification.recordDemoChecks(ProviderVerification.DOCTOR, doctor.getId());
		doctorAdmin.review(doctor.getId(), Doctor.APPROVED, null);
		DoctorFeeService.Checkout checkout = doctorFees.checkout(user, "registration");
		doctorFees.simulate(user, checkout.intentId());
		doctorAccounts.declareIndemnity(user, new DoctorAccountService.IndemnityInput("MDA National",
				"MDA-" + licence, LocalDate.now().plusMonths(9), true, true));
		return user;
	}

	/** James Whitfield, a registered migration agent in Sydney: the lawyer demo login. */
	private Lawyer lawyer() {
		lawyerAccounts.createAccount(LAWYER_EMAIL, PASSWORD);
		CurrentUser user = verified(LAWYER_EMAIL, Role.LAWYER);
		Lawyer lawyer = lawyerAccounts.register(user, new LawyerAccountService.RegistrationInput(
				new LawyerAccountService.ProfileInput(Lawyer.INDIVIDUAL, "James Whitfield", "51824753556",
						"+61 2 9000 4400", "Level 5, 60 Martin Place", "Sydney NSW", "2000",
						"Twelve years of medical treatment (subclass 602) and visitor visa applications.",
						"Australia/Sydney"),
				new LawyerAccountService.CredentialInput(Lawyer.MARN, "1712345", null, LocalDate.now().plusMonths(10))),
				new LawyerAccountService.RegistrationFiles(BytesMultipartFile.pdf("credentialCertificate",
						"MARN registration"), BytesMultipartFile.pdf("indemnityInsurance", "Professional indemnity"),
						List.of()));
		verification.recordDemoChecks(ProviderVerification.LAWYER, lawyer.getId());
		return lawyerAdmin.review(null, lawyer.getId(), Lawyer.APPROVED, null);
	}

	/** A law firm waiting in the admin portal's Lawyer Approvals (practising certificate, Victoria). */
	private void pendingLawyer() {
		lawyerAccounts.createAccount("pending.lawyer@demo.local", PASSWORD);
		CurrentUser user = verified("pending.lawyer@demo.local", Role.LAWYER);
		lawyerAccounts.register(user, new LawyerAccountService.RegistrationInput(
				new LawyerAccountService.ProfileInput(Lawyer.LAW_FIRM, "Harbourside Immigration Lawyers",
						"51824753556", "+61 3 9000 5500", "120 Collins Street", "Melbourne VIC", "3000",
						"Firm of four practitioners; health and visitor visas.", "Australia/Melbourne"),
				new LawyerAccountService.CredentialInput(Lawyer.PRACTISING_CERTIFICATE, "PC-VIC-48211", "VIC",
						LocalDate.now().plusMonths(8))),
				new LawyerAccountService.RegistrationFiles(BytesMultipartFile.pdf("credentialCertificate",
						"Practising certificate"), null, List.of()));
	}

	/** The coordinator account for the admin portal. */
	private void admin() {
		AppUser admin = new AppUser(ADMIN_EMAIL, passwordEncoder.encode(PASSWORD), Role.ADMIN);
		admin.markEmailVerified();
		users.save(admin);
	}

	/** A registration waiting in the admin portal's Doctor Approvals. */
	private void pendingDoctor(List<Hospital> affiliated) {
		doctorAccounts.createAccount("pending.doctor@demo.local", PASSWORD);
		CurrentUser user = verified("pending.doctor@demo.local", Role.DOCTOR);
		doctorAccounts.register(user,
				new DoctorAccountService.RegistrationInput("Dr. Olivia Grant", "+61 412 555 020",
						List.of("Dermatology"), "MBBS, FACD", 9, "MED0001234563",
						"Dermatologist focused on chronic skin conditions and laser therapy.", List.of("English"),
						"Dermatology", "consultant", List.of(affiliated.get(1).getId()),
						List.of("mon", "wed", "fri")),
				new DoctorAccountService.RegistrationFiles(null, BytesMultipartFile.pdf("medicalLicense", "Medical license"),
						BytesMultipartFile.pdf("degreeCertificate", "Degree certificate"), List.of()));
	}

	private CurrentUser verified(String email, Role role) {
		AppUser user = users.findByEmail(email).orElseThrow();
		user.markEmailVerified();
		users.save(user);
		return new CurrentUser(user.getId(), user.getEmail(), role);
	}

}
