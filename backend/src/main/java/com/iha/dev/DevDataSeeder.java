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
import com.iha.provider.Hospital;
import com.iha.provider.HospitalRepository;

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

	DevDataSeeder(AppUserRepository users, HospitalRepository hospitals, DoctorRepository doctors,
			PatientService patients, CaseService cases, DoctorAccountService doctorAccounts,
			DoctorAdminService doctorAdmin, DoctorCaseService doctorCases, DoctorFeeService doctorFees) {
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
				hospital("St Vincent's Hospital Sydney", "Sydney"),
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

		log.info("Dev demo data ready. Sign in as {} or {} with password {}", PATIENT_EMAIL, DOCTOR_EMAIL, PASSWORD);
	}

	private Hospital hospital(String name, String city) {
		Hospital hospital = new Hospital(null, name, city, "Australia");
		hospital.setRoomTypes(new String[] { "Standard", "Private", "Deluxe Suite" });
		return hospitals.save(hospital);
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

	private CurrentUser doctor(List<Hospital> affiliated) {
		doctorAccounts.createAccount(DOCTOR_EMAIL, PASSWORD);
		CurrentUser user = verified(DOCTOR_EMAIL, Role.DOCTOR);
		Doctor doctor = doctorAccounts.register(user,
				new DoctorAccountService.RegistrationInput("Dr. Amelia Chen", "+61 412 555 010",
						List.of("Cardiology", "Orthopaedics & Joint Replacement"), "MBBS, FRACS", 15, "MED0001234560",
						"Consultant cardiothoracic and orthopaedic surgeon with 15 years of experience.",
						List.of("English", "Mandarin (Chinese)"), "Surgery", "surgeon",
						affiliated.stream().map(Hospital::getId).toList(), List.of("mon", "tue", "wed", "thu", "fri")),
				new DoctorAccountService.RegistrationFiles(null, BytesMultipartFile.pdf("medicalLicense", "Medical license"),
						BytesMultipartFile.pdf("degreeCertificate", "Degree certificate"), List.of()));
		doctorAdmin.review(doctor.getId(), Doctor.APPROVED, null);
		DoctorFeeService.Checkout checkout = doctorFees.checkout(user, "registration");
		doctorFees.simulate(user, checkout.intentId());
		return user;
	}

	private CurrentUser verified(String email, Role role) {
		AppUser user = users.findByEmail(email).orElseThrow();
		user.markEmailVerified();
		users.save(user);
		return new CurrentUser(user.getId(), user.getEmail(), role);
	}

}
