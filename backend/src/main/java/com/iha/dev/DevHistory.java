package com.iha.dev;

import java.math.BigDecimal;
import java.sql.Timestamp;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.UUID;

import com.iha.auth.CurrentUser;
import com.iha.auth.Role;
import com.iha.consultation.ConsultationService;
import com.iha.doctor.DoctorConsultationService;
import com.iha.cases.CaseService;
import com.iha.cases.MedicalCase;
import com.iha.doctor.DoctorAdminService;
import com.iha.doctor.DoctorCaseService;
import com.iha.doctor.DoctorPlanService;
import com.iha.payment.PaymentService;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorCaseAssignment;
import com.iha.provider.DoctorRepository;
import com.iha.provider.Hospital;
import com.iha.treatment.PatientTreatmentService;
import com.iha.treatment.TreatmentOption;
import com.iha.treatment.TreatmentPlanRepository;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;

/**
 * DEV PROFILE ONLY. Gives the demo doctor a year of history so the dashboard
 * has something to show: treated and paid cases spread over past months, a
 * case lost to another doctor, and two peer doctors in Cardiology for the
 * anonymised benchmark and rank. Runs the real services, then backdates the
 * timestamps with SQL (the services always stamp "now").
 */
@Profile("dev")
@Component
class DevHistory {

	@FunctionalInterface
	interface PeerFactory {

		CurrentUser create(String email, String name, String licence);

	}

	private static final ZoneId ZONE = ZoneId.of("Australia/Brisbane");

	private final CaseService cases;
	private final DoctorAdminService admin;
	private final DoctorCaseService doctorCases;
	private final DoctorPlanService plans;
	private final DoctorRepository doctors;
	private final TreatmentPlanRepository planRepository;
	private final PatientTreatmentService treatments;
	private final PaymentService payments;
	private final JdbcTemplate jdbc;
	private final DoctorConsultationService consultations;
	private final ConsultationService patientConsultations;

	DevHistory(CaseService cases, DoctorAdminService admin, DoctorCaseService doctorCases, DoctorPlanService plans,
			DoctorRepository doctors, TreatmentPlanRepository planRepository, PatientTreatmentService treatments,
			PaymentService payments, JdbcTemplate jdbc, DoctorConsultationService consultations,
			ConsultationService patientConsultations) {
		this.consultations = consultations;
		this.patientConsultations = patientConsultations;
		this.cases = cases;
		this.admin = admin;
		this.doctorCases = doctorCases;
		this.plans = plans;
		this.doctors = doctors;
		this.planRepository = planRepository;
		this.treatments = treatments;
		this.payments = payments;
		this.jdbc = jdbc;
	}

	void seed(CurrentUser patient, CurrentUser doctor, List<Hospital> hospitals, PeerFactory peers) {
		CurrentUser peerA = peers.create("peer1@demo.local", "Dr. Rahul Mehta", "MED0001234561");
		CurrentUser peerB = peers.create("peer2@demo.local", "Dr. Sarah Wilson", "MED0001234562");
		UUID hospital = hospitals.get(0).getId();

		// Treated cases, paid 8, 6 and 3 months ago.
		treated(patient, doctor, hospital, "Cardiology", "Coronary artery bypass (CABG)", 32500, 14000, 8, 3);
		treated(patient, doctor, hospital, "Cardiology", "Angioplasty with stent", 14800, 6200, 6, 9);
		treated(patient, doctor, hospital, "Orthopaedics & Joint Replacement", "Total knee replacement", 18200, 9800,
				3, 20);
		// Paid last month, treatment still ahead.
		paid(patient, doctor, hospital, "Cardiology", "Heart valve repair", 26400, 11800, 1, 5);

		// The patient chose another doctor's plan.
		UUID contested = acceptedCase(patient, doctor, "Cardiology", 30);
		accept(peerA, contested, 12);
		UUID mineOnContested = submitPlan(doctor, contested, hospital, "Pacemaker implantation", 15500, 6900);
		admin.publishPlan(mineOnContested, new BigDecimal("1500"));
		UUID theirs = submitPlan(peerA, contested, hospital, "Pacemaker implantation", 12900, 6100);
		TreatmentOption chosen = admin.publishPlan(theirs, new BigDecimal("1500"));
		selectAndPay(patient, contested, chosen, 4);

		// Peers' submitted Cardiology plans for the benchmark.
		UUID peerCase = acceptedCase(patient, peerB, "Cardiology", 6);
		submitPlan(peerB, peerCase, hospital, "Coronary artery bypass (CABG)", 26000, 12500);
		UUID peerCase2 = acceptedCase(patient, peerA, "Cardiology", 8);
		submitPlan(peerA, peerCase2, hospital, "Angioplasty with stent", 13200, 6400);
	}

	private void treated(CurrentUser patient, CurrentUser doctor, UUID hospital, String specialty, String procedure,
			int doctorFee, int hospitalFee, int monthsAgo, int responseHours) {
		UUID caseId = paid(patient, doctor, hospital, specialty, procedure, doctorFee, hospitalFee, monthsAgo,
				responseHours);
		jdbc.update("update treatment_plans set treatment_start_date = ?, treatment_end_date = ? where case_id = ?",
				LocalDate.now(ZONE).minusMonths(monthsAgo).plusDays(10), LocalDate.now(ZONE).minusMonths(monthsAgo).plusDays(17),
				caseId);
		doctorCases.markCompleted(doctor, caseId);
	}

	UUID paid(CurrentUser patient, CurrentUser doctor, UUID hospital, String specialty, String procedure,
			int doctorFee, int hospitalFee, int monthsAgo, int responseHours) {
		UUID caseId = acceptedCase(patient, doctor, specialty, responseHours);
		UUID planId = submitPlan(doctor, caseId, hospital, procedure, doctorFee, hospitalFee);
		TreatmentOption option = admin.publishPlan(planId, new BigDecimal("1500"));
		selectAndPay(patient, caseId, option, monthsAgo);
		return caseId;
	}

	/** A case from the demo patient that `doctor` accepted `responseHours` after the invitation. */
	private UUID acceptedCase(CurrentUser patient, CurrentUser doctor, String specialty, int responseHours) {
		MedicalCase medicalCase = cases.submit(patient, specialty, null,
				"Symptoms have worsened over the past year despite treatment at home; my local specialist "
						+ "recommended a procedure and I would like options in Australia.",
				List.of("lab_report"), List.of(BytesMultipartFile.pdf("files", "Report")));
		accept(doctor, medicalCase.getId(), responseHours);
		return medicalCase.getId();
	}

	private void accept(CurrentUser doctor, UUID caseId, int responseHours) {
		Doctor row = doctors.findByUserId(doctor.id()).orElseThrow();
		DoctorCaseAssignment assignment = admin.assignCase(caseId, row.getId());
		doctorCases.respond(doctor, assignment.getId(), "accepted", null);
		doctorCases.startEvaluation(doctor, caseId);
		Timestamp responded = jdbc.queryForObject("select responded_at from doctor_case_assignments where id = ?",
				Timestamp.class, assignment.getId());
		jdbc.update("update doctor_case_assignments set invited_at = ? where id = ?",
				Timestamp.from(responded.toInstant().minus(Duration.ofHours(responseHours))), assignment.getId());
	}

	private UUID submitPlan(CurrentUser doctor, UUID caseId, UUID hospital, String procedure, int doctorFee,
			int hospitalFee) {
		consult(doctor, caseId);
		LocalDate start = LocalDate.now(ZONE).plusDays(40);
		plans.submit(doctor, caseId, new DoctorPlanService.PlanInput("Confirmed on imaging and specialist review.",
				"surgery", procedure, null, null, "Full recovery expected", "95%", start, start.plusDays(6), "4-6 weeks",
				"5 nights", hospital, "Cardiology", "Private", null, BigDecimal.valueOf(doctorFee),
				BigDecimal.valueOf(hospitalFee), List.of(new DoctorPlanService.CostItem("Diagnostics & Lab",
						new BigDecimal("1200"))),
				null, null, List.of("Rest for two weeks"),
				List.of(new DoctorPlanService.SpecialistInput("anaesthetist", null, new BigDecimal("1800"), null))));
		Doctor row = doctors.findByUserId(doctor.id()).orElseThrow();
		return planRepository.findByCaseIdAndDoctorId(caseId, row.getId()).orElseThrow().getId();
	}

	/** The initial Zoom consultation: proposed, chosen and paid by the patient, then moved into the past. */
	private void consult(CurrentUser doctor, UUID caseId) {
		LocalDate day = LocalDate.now(ZONE).plusDays(3);
		DoctorConsultationService.ConsultationView view = consultations.proposeInitial(doctor, caseId,
				List.of(new DoctorConsultationService.SlotInput(day.toString(), "10:00", "10:30")));
		UUID requestId = view.request().getId();
		CurrentUser patient = patientOf(caseId);
		patientConsultations.selectSlot(patient, requestId, view.slots().get(0).getId());
		PaymentService.Checkout checkout = payments.startConsultationCheckout(patient, requestId);
		payments.simulateSuccess(patient, checkout.intentId());
		DevTime.consultationHeld(jdbc, requestId);
	}

	private CurrentUser patientOf(UUID caseId) {
		UUID patientUserId = jdbc.queryForObject(
				"select p.user_id from cases c join patients p on p.id = c.patient_id where c.id = ?", UUID.class, caseId);
		String email = jdbc.queryForObject("select email from app_users where id = ?", String.class, patientUserId);
		return new CurrentUser(patientUserId, email, Role.PATIENT);
	}

	private void selectAndPay(CurrentUser patient, UUID caseId, TreatmentOption option, int monthsAgo) {
		treatments.select(patient, option.getId());
		PaymentService.Checkout checkout = payments.startTreatmentCheckout(patient, caseId);
		payments.simulateSuccess(patient, checkout.intentId());
		ZonedDateTime paidAt = ZonedDateTime.now(ZONE).minusMonths(monthsAgo).withDayOfMonth(12);
		jdbc.update("update payments set paid_at = ?, created_at = ? where case_id = ?", Timestamp.from(paidAt.toInstant()),
				Timestamp.from(paidAt.toInstant()), caseId);
		Duration back = Duration.ofDays(monthsAgo * 30L + 20);
		jdbc.query("select id, invited_at, responded_at from doctor_case_assignments where case_id = ?", rs -> {
			jdbc.update("update doctor_case_assignments set invited_at = ?, responded_at = ? where id = ?",
					Timestamp.from(rs.getTimestamp("invited_at").toInstant().minus(back)),
					Timestamp.from(rs.getTimestamp("responded_at").toInstant().minus(back)), rs.getObject("id"));
		}, caseId);
	}

}
