package com.iha.hospital;

import java.io.ByteArrayInputStream;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.iha.admin.AdminService;
import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.cases.CaseRepository;
import com.iha.cases.CaseStatus;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.common.AustralianTimeZones;
import com.iha.doctor.DoctorAccountService;
import com.iha.notification.NotificationService;
import com.iha.patient.Patient;
import com.iha.patient.PatientRepository;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorCaseAssignment;
import com.iha.provider.DoctorCaseAssignmentRepository;
import com.iha.provider.DoctorHospitalAffiliation;
import com.iha.provider.DoctorHospitalAffiliationRepository;
import com.iha.provider.DoctorRepository;
import com.iha.provider.Hospital;
import com.iha.storage.StorageService;
import com.iha.treatment.TreatmentPlan;
import com.iha.treatment.TreatmentPlanRepository;
import com.iha.visa.VisaDocument;
import com.iha.visa.VisaDocumentRepository;
import com.iha.visa.VisaSubmission;
import com.iha.visa.VisaSubmissionRepository;

import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * What an approved hospital sees and does. A hospital sees a case (and its
 * patient and doctor) once one of its doctors has submitted a treatment plan
 * naming the hospital (old RLS {@code hospital_has_access_to_case}); its only
 * write action is issuing the two visa letters for cases whose patient chose
 * and paid for that plan ({@code generate_hospital_visa_document},
 * {@code send_visa_document_to_patient}).
 */
@Service
public class HospitalPortalService {

	/** Case statuses in which the hospital's letters can be issued. */
	static final Set<CaseStatus> LETTER_STATUSES = EnumSet.of(CaseStatus.PAYMENT_CONFIRMED,
			CaseStatus.VISA_DOCUMENTS_SUBMITTED, CaseStatus.VISA_PROCESSING, CaseStatus.TRAVEL_READY,
			CaseStatus.COMPLETED);

	static final List<String> LETTER_TYPES = List.of(VisaDocument.HOSPITAL_INVITATION,
			VisaDocument.APPOINTMENT_CONFIRMATION);

	static final Map<String, String> LETTER_LABELS = Map.of(VisaDocument.HOSPITAL_INVITATION,
			"Hospital Invitation Letter", VisaDocument.APPOINTMENT_CONFIRMATION, "Appointment Confirmation Letter");

	private final HospitalAccountService accounts;
	private final TreatmentPlanRepository plans;
	private final CaseRepository cases;
	private final PatientRepository patients;
	private final DoctorRepository doctors;
	private final DoctorHospitalAffiliationRepository affiliations;
	private final DoctorCaseAssignmentRepository assignments;
	private final DoctorAccountService doctorAccounts;
	private final AdminService planDetails;
	private final VisaDocumentRepository visaDocuments;
	private final VisaSubmissionRepository submissions;
	private final HospitalLetterRenderer letters;
	private final StorageService storage;
	private final NotificationService notifications;
	private final AuditService audit;

	HospitalPortalService(HospitalAccountService accounts, TreatmentPlanRepository plans,
			CaseRepository cases, PatientRepository patients, DoctorRepository doctors,
			DoctorHospitalAffiliationRepository affiliations, DoctorCaseAssignmentRepository assignments,
			DoctorAccountService doctorAccounts, AdminService planDetails, VisaDocumentRepository visaDocuments,
			VisaSubmissionRepository submissions, HospitalLetterRenderer letters, StorageService storage,
			NotificationService notifications, AuditService audit) {
		this.accounts = accounts;
		this.plans = plans;
		this.cases = cases;
		this.patients = patients;
		this.doctors = doctors;
		this.affiliations = affiliations;
		this.assignments = assignments;
		this.doctorAccounts = doctorAccounts;
		this.planDetails = planDetails;
		this.visaDocuments = visaDocuments;
		this.submissions = submissions;
		this.letters = letters;
		this.storage = storage;
		this.notifications = notifications;
		this.audit = audit;
	}

	// ── Dashboard ──────────────────────────────────────────────────────────

	@Transactional(readOnly = true)
	public Dashboard dashboard(CurrentUser user) {
		Hospital hospital = accounts.requireApproved(user);
		List<CaseRow> rows = caseRows(hospital);
		LocalDate today = LocalDate.now(AustralianTimeZones.zone(hospital.getTimeZone()));
		List<CaseRow> confirmed = rows.stream().filter(CaseRow::chosen).toList();
		List<CaseRow> upcoming = confirmed.stream()
			.filter(r -> r.admissionDate() != null && !r.admissionDate().isBefore(today)
					&& r.caseStatus() != CaseStatus.COMPLETED)
			.sorted(Comparator.comparing(CaseRow::admissionDate))
			.limit(5)
			.toList();
		long lettersToIssue = confirmed.stream().filter(r -> r.lettersEligible() && r.lettersSent() < 2).count();
		return new Dashboard(affiliations.findByHospitalId(hospital.getId()).size(),
				rows.stream().map(CaseRow::patientId).distinct().count(),
				rows.stream().map(CaseRow::caseId).distinct().count(), confirmed.size(),
				rows.stream().filter(r -> r.caseStatus() == CaseStatus.COMPLETED && r.chosen()).count(),
				lettersToIssue, upcoming, rows.stream().limit(5).toList());
	}

	// ── Cases ───────────────────────────────────────────────────────────────

	@Transactional(readOnly = true)
	public List<CaseRow> cases(CurrentUser user) {
		return caseRows(accounts.requireApproved(user));
	}

	/** {@code planId} identifies the case and doctor: one case can reach the hospital through two doctors. */
	@Transactional(readOnly = true)
	public CaseDetail caseDetail(CurrentUser user, UUID planId) {
		Hospital hospital = accounts.requireApproved(user);
		TreatmentPlan plan = visiblePlan(hospital, planId);
		AdminService.PlanDetail p = planDetails.plan(plan.getId());
		MedicalCase c = p.medicalCase();
		Patient patient = patients.findById(c.getPatientId()).orElseThrow();
		Doctor doctor = p.doctor();
		DoctorCaseAssignment assignment = assignments.findByCaseIdAndDoctorId(c.getId(), plan.getDoctorId())
			.orElse(null);
		return new CaseDetail(row(plan, c, patient, doctor, letterDocs(List.of(c.getId())).getOrDefault(c.getId(),
				List.of())), c.getDescription(), patientInfo(patient),
				doctor == null ? null : new DoctorSummary(doctor.getId(), doctor.getFullName(), list(doctor.getSpecialties()),
						doctor.getContactEmail(), doctor.getContactPhone()),
				assignment == null ? null : assignment.getStatus(),
				new PlanSummary(plan.getDiagnosis(), plan.getTreatmentType(), plan.getProcedureName(), plan.getTechnique(),
						plan.getDescription(), plan.getExpectedOutcome(), plan.getTreatmentStartDate(),
						plan.getTreatmentEndDate(), plan.getTreatmentDurationDays(), plan.getEstimatedLengthOfStay(),
						plan.getRecoveryTime(), plan.getDepartment(), plan.getRoomCategory(),
						plan.getSpecialRequirements(), plan.getDoctorFeesAud(), plan.getHospitalFeesAud(),
						p.costItems().stream().map(i -> new CostLine(i.label(), i.amount())).toList(), p.totalAud(),
						plan.getSubmittedAt()),
				letterViews(c, plan));
	}

	// ── Patients ────────────────────────────────────────────────────────────

	@Transactional(readOnly = true)
	public List<PatientRow> patients(CurrentUser user) {
		List<CaseRow> rows = caseRows(accounts.requireApproved(user));
		Map<UUID, List<CaseRow>> byPatient = rows.stream()
			.collect(Collectors.groupingBy(CaseRow::patientId, LinkedHashMap::new, Collectors.toList()));
		Map<UUID, Patient> patientById = byId(patients.findAllById(byPatient.keySet()), Patient::getId);
		return byPatient.entrySet().stream().map(e -> {
			Patient p = patientById.get(e.getKey());
			CaseRow latest = e.getValue().get(0);
			return new PatientRow(e.getKey(), p == null ? null : p.getFullName(), p == null ? null : p.getDateOfBirth(),
					p == null ? null : p.getGender(), p == null ? null : p.getCountryOfResidence(),
					e.getValue().stream().map(CaseRow::caseId).distinct().count(), latest.planId(),
					latest.referenceNumber());
		}).sorted(Comparator.comparing(r -> r.fullName() == null ? "" : r.fullName().toLowerCase())).toList();
	}

	@Transactional(readOnly = true)
	public PatientDetail patient(CurrentUser user, UUID patientId) {
		List<CaseRow> rows = caseRows(accounts.requireApproved(user)).stream()
			.filter(r -> r.patientId().equals(patientId))
			.toList();
		if (rows.isEmpty()) {
			throw ApiException.notFound("Patient not found.");
		}
		Patient p = patients.findById(patientId).orElseThrow(() -> ApiException.notFound("Patient not found."));
		return new PatientDetail(patientId, p.getFullName(), patientInfo(p), rows);
	}

	// ── Doctors ─────────────────────────────────────────────────────────────

	/** Doctors who list this hospital as an affiliation (they choose it themselves). */
	@Transactional(readOnly = true)
	public List<DoctorRow> doctors(CurrentUser user) {
		Hospital hospital = accounts.requireApproved(user);
		List<UUID> ids = affiliations.findByHospitalId(hospital.getId()).stream()
			.map(DoctorHospitalAffiliation::getDoctorId)
			.toList();
		List<CaseRow> rows = caseRows(hospital);
		return doctors.findAllById(ids).stream()
			.map(d -> new DoctorRow(d.getId(), d.getFullName(), list(d.getSpecialties()), d.getDepartment(), d.getRole(),
					d.getContactEmail(), d.getContactPhone(), d.getYearsExperience(), d.getStatus(),
					rows.stream().filter(r -> d.getId().equals(r.doctorId())).count()))
			.sorted(Comparator.comparing(r -> r.fullName().toLowerCase()))
			.toList();
	}

	@Transactional(readOnly = true)
	public DoctorDetail doctor(CurrentUser user, UUID doctorId) {
		Hospital hospital = accounts.requireApproved(user);
		if (!affiliations.existsByDoctorIdAndHospitalId(doctorId, hospital.getId())) {
			throw ApiException.notFound("Doctor not found.");
		}
		Doctor d = doctors.findById(doctorId).orElseThrow(() -> ApiException.notFound("Doctor not found."));
		List<CaseRow> rows = caseRows(hospital).stream().filter(r -> doctorId.equals(r.doctorId())).toList();
		List<String> hospitalNames = doctorAccounts.affiliatedHospitals(d).stream().map(Hospital::getName).toList();
		return new DoctorDetail(d.getId(), d.getFullName(), d.getStatus(), d.getGender(), d.getContactEmail(),
				d.getContactPhone(), list(d.getSpecialties()), d.getQualifications(), d.getYearsExperience(),
				d.getLicenseNumber(), d.getDepartment(), d.getRole(), list(d.getLanguagesSpoken()), d.getBio(),
				hospitalNames, doctorAccounts.availability(d), rows.size(),
				rows.stream().filter(r -> r.caseStatus().isInProgress()).count(),
				rows.stream().filter(r -> r.caseStatus() == CaseStatus.COMPLETED).count(), rows);
	}

	// ── Letters ─────────────────────────────────────────────────────────────

	/** Cases whose patient chose and paid for this hospital's plan, with their letters. */
	@Transactional(readOnly = true)
	public List<CaseRow> letterCases(CurrentUser user) {
		return caseRows(accounts.requireApproved(user)).stream().filter(CaseRow::lettersEligible).toList();
	}

	@Transactional
	public LetterView generate(CurrentUser user, UUID planId, String type) {
		Hospital hospital = accounts.requireApproved(user);
		if (!LETTER_TYPES.contains(type)) {
			throw ApiException.badRequest("invalid_document_type", "Unknown letter type.");
		}
		TreatmentPlan plan = visiblePlan(hospital, planId);
		MedicalCase c = cases.findById(plan.getCaseId()).orElseThrow();
		requireEligible(plan, c);
		Patient patient = patients.findById(c.getPatientId()).orElseThrow();
		Doctor doctor = doctors.findById(plan.getDoctorId()).orElse(null);
		HospitalLetterRenderer.LetterInput input = new HospitalLetterRenderer.LetterInput(hospital.getName(),
				hospital.getAddress(), hospital.getCity(), hospital.getCountry(), hospital.getZipCode(),
				hospital.getPhone(), hospital.getContactEmail(), hospital.getTimeZone(), c.getReferenceNumber(), condition(c),
				patient.getFullName(), patient.getDateOfBirth(), patient.getCountryOfResidence(),
				doctor == null ? null : doctor.getFullName(), plan.getDiagnosis(), plan.getProcedureName(),
				plan.getDepartment(), plan.getTreatmentStartDate(), plan.getTreatmentEndDate(),
				plan.getEstimatedLengthOfStay());
		byte[] pdf = VisaDocument.HOSPITAL_INVITATION.equals(type) ? letters.invitation(input)
				: letters.appointmentConfirmation(input);
		String path = "visa-documents/hospital-generated/%s/%s-%s.pdf".formatted(c.getId(), type, UUID.randomUUID());
		storage.store(path, new ByteArrayInputStream(pdf));
		String fileName = c.getReferenceNumber() + "-" + type + ".pdf";
		VisaDocument doc = visaDocuments
			.findFirstByCaseIdAndSourceAndCategory(c.getId(), VisaDocument.HOSPITAL_GENERATED, type)
			.orElse(null);
		if (doc == null) {
			UUID submissionId = submissions.findByCaseId(c.getId()).map(VisaSubmission::getId).orElse(null);
			doc = visaDocuments.save(VisaDocument.hospitalLetter(c.getPatientId(), c.getId(), submissionId,
					hospital.getId(), type, fileName, path, pdf.length));
		}
		else {
			String previous = doc.getFilePath();
			doc.replaceFile(fileName, path, pdf.length);
			try {
				storage.delete(previous);
			}
			catch (RuntimeException ignored) {
				// An orphaned old letter is harmless.
			}
		}
		audit.record(user.id(), user.email(), "hospital", "visa_document.generated", "case", c.getId(),
				Map.of("document_type", type));
		return LetterView.of(doc);
	}

	@Transactional
	public LetterView send(CurrentUser user, UUID planId, String type) {
		Hospital hospital = accounts.requireApproved(user);
		TreatmentPlan plan = visiblePlan(hospital, planId);
		MedicalCase c = cases.findById(plan.getCaseId()).orElseThrow();
		requireEligible(plan, c);
		VisaDocument doc = visaDocuments
			.findFirstByCaseIdAndSourceAndCategory(c.getId(), VisaDocument.HOSPITAL_GENERATED, type)
			.filter(d -> hospital.getId().equals(d.getHospitalId()))
			.orElseThrow(() -> ApiException.conflict("not_generated", "Generate the letter before sending it."));
		if (doc.getSentToPatientAt() == null) {
			doc.markSentToPatient();
			patients.findById(c.getPatientId()).map(Patient::getUserId).ifPresent(userId -> {
				String label = LETTER_LABELS.get(type);
				notifications.notifyWithAlert(userId, "visa_document_available", label + " available",
						"Your hospital has issued your " + label.toLowerCase()
								+ " — it's ready to download from your Visa & Travel section.",
						c.getId());
			});
			audit.record(user.id(), user.email(), "hospital", "visa_document.sent_to_patient", "case", c.getId(),
					Map.of("document_type", type));
		}
		return LetterView.of(doc);
	}

	@Transactional(readOnly = true)
	public LetterFile letterFile(CurrentUser user, UUID planId, String type) {
		Hospital hospital = accounts.requireApproved(user);
		TreatmentPlan plan = visiblePlan(hospital, planId);
		VisaDocument doc = visaDocuments
			.findFirstByCaseIdAndSourceAndCategory(plan.getCaseId(), VisaDocument.HOSPITAL_GENERATED, type)
			.filter(d -> hospital.getId().equals(d.getHospitalId()))
			.orElseThrow(() -> ApiException.notFound("Letter not found."));
		return new LetterFile(doc.getFileName(), storage.load(doc.getFilePath()));
	}

	// ── Helpers ─────────────────────────────────────────────────────────────

	private List<CaseRow> caseRows(Hospital hospital) {
		List<TreatmentPlan> visible = plans.findByHospitalIdAndStatusNot(hospital.getId(), TreatmentPlan.DRAFT);
		if (visible.isEmpty()) {
			return List.of();
		}
		Map<UUID, MedicalCase> caseById = byId(cases.findAllById(ids(visible, TreatmentPlan::getCaseId)),
				MedicalCase::getId);
		Map<UUID, Patient> patientById = byId(
				patients.findAllById(caseById.values().stream().map(MedicalCase::getPatientId).distinct().toList()),
				Patient::getId);
		Map<UUID, Doctor> doctorById = byId(doctors.findAllById(ids(visible, TreatmentPlan::getDoctorId)),
				Doctor::getId);
		Map<UUID, List<VisaDocument>> lettersByCase = letterDocs(caseById.keySet());
		return visible.stream()
			.filter(p -> caseById.containsKey(p.getCaseId()))
			.map(p -> {
				MedicalCase c = caseById.get(p.getCaseId());
				return row(p, c, patientById.get(c.getPatientId()), doctorById.get(p.getDoctorId()),
						lettersByCase.getOrDefault(c.getId(), List.of()));
			})
			.sorted(Comparator.comparing(CaseRow::submittedAt, Comparator.nullsLast(Comparator.reverseOrder())))
			.toList();
	}

	private CaseRow row(TreatmentPlan p, MedicalCase c, Patient patient, Doctor doctor, List<VisaDocument> letterDocs) {
		boolean chosen = TreatmentPlan.PATIENT_CONFIRMED.equals(p.getStatus());
		boolean eligible = chosen && LETTER_STATUSES.contains(c.getStatus());
		long sent = letterDocs.stream().filter(d -> d.getSentToPatientAt() != null).count();
		return new CaseRow(p.getId(), c.getId(), c.getReferenceNumber(), condition(c), c.getStatus(), p.getStatus(),
				c.getPatientId(), patient == null ? null : patient.getFullName(), p.getDoctorId(),
				doctor == null ? null : doctor.getFullName(), p.getProcedureName(), p.getTreatmentStartDate(),
				p.getSubmittedAt(), c.getCreatedAt(), chosen, eligible, letterDocs.size(), sent);
	}

	private TreatmentPlan visiblePlan(Hospital hospital, UUID planId) {
		return plans.findById(planId)
			.filter(p -> hospital.getId().equals(p.getHospitalId()) && !TreatmentPlan.DRAFT.equals(p.getStatus()))
			.orElseThrow(() -> ApiException.notFound("Case not found."));
	}

	private static void requireEligible(TreatmentPlan plan, MedicalCase c) {
		if (!TreatmentPlan.PATIENT_CONFIRMED.equals(plan.getStatus())) {
			throw ApiException.conflict("plan_not_selected",
					"Letters can be issued once the patient has chosen this treatment plan.");
		}
		if (!LETTER_STATUSES.contains(c.getStatus())) {
			throw ApiException.conflict("case_not_payment_confirmed",
					"Letters can be issued once the patient has paid for the treatment.");
		}
	}

	private List<LetterView> letterViews(MedicalCase c, TreatmentPlan plan) {
		Map<String, VisaDocument> byType = letterDocs(List.of(c.getId())).getOrDefault(c.getId(), List.of()).stream()
			.collect(Collectors.toMap(VisaDocument::getCategory, Function.identity(), (a, b) -> a));
		return LETTER_TYPES.stream()
			.map(type -> byType.containsKey(type) ? LetterView.of(byType.get(type))
					: new LetterView(type, LETTER_LABELS.get(type), null, null, null))
			.toList();
	}

	private Map<UUID, List<VisaDocument>> letterDocs(Collection<UUID> caseIds) {
		return caseIds.isEmpty() ? Map.of()
				: visaDocuments.findByCaseIdInAndSource(caseIds, VisaDocument.HOSPITAL_GENERATED).stream()
					.filter(d -> LETTER_TYPES.contains(d.getCategory()))
					.collect(Collectors.groupingBy(VisaDocument::getCaseId));
	}

	private static PatientInfo patientInfo(Patient p) {
		return new PatientInfo(p.getDateOfBirth(), p.getGender(), p.getNationality(), p.getCountryOfResidence(),
				p.getMedicalHistory(), p.getAllergies(), p.getCurrentMedications(), p.getPastSurgeries());
	}

	private static String condition(MedicalCase c) {
		return c.getSpecialtyOther() != null && !c.getSpecialtyOther().isBlank() ? c.getSpecialtyOther()
				: c.getSpecialty();
	}

	private static <T> List<UUID> ids(List<T> list, Function<T, UUID> id) {
		return list.stream().map(id).filter(Objects::nonNull).distinct().toList();
	}

	private static <T> Map<UUID, T> byId(List<T> list, Function<T, UUID> id) {
		return list.stream().collect(Collectors.toMap(id, Function.identity(), (a, b) -> a));
	}

	private static List<String> list(String[] values) {
		return values == null ? List.of() : Arrays.asList(values);
	}

	/**
	 * One case as it reaches this hospital through one doctor's plan.
	 * @param chosen the patient chose (and paid for) this plan
	 * @param lettersEligible letters can be issued
	 */
	public record CaseRow(UUID planId, UUID caseId, String referenceNumber, String condition, CaseStatus caseStatus,
			String planStatus, UUID patientId, String patientName, UUID doctorId, String doctorName, String procedure,
			LocalDate admissionDate, Instant submittedAt, Instant caseCreatedAt, boolean chosen,
			boolean lettersEligible, long lettersGenerated, long lettersSent) {
	}

	public record Dashboard(long doctors, long patients, long cases, long confirmedTreatments, long treated,
			long lettersToIssue, List<CaseRow> upcomingAdmissions, List<CaseRow> recentCases) {
	}

	/** Clinical details only: no contact details (as in the old portal). */
	public record PatientInfo(LocalDate dateOfBirth, String gender, String nationality, String countryOfResidence,
			String medicalHistory, List<String> allergies, List<String> currentMedications, String pastSurgeries) {
	}

	public record PatientRow(UUID id, String fullName, LocalDate dateOfBirth, String gender, String country,
			long caseCount, UUID latestPlanId, String latestReference) {
	}

	public record PatientDetail(UUID id, String fullName, PatientInfo info, List<CaseRow> cases) {
	}

	public record DoctorSummary(UUID id, String fullName, List<String> specialties, String email, String phone) {
	}

	public record DoctorRow(UUID id, String fullName, List<String> specialties, String department, String role,
			String email, String phone, Integer yearsOfExperience, String status, long cases) {
	}

	public record DoctorDetail(UUID id, String fullName, String status, String gender, String email, String phone,
			List<String> specialties, String qualifications, Integer yearsOfExperience, String licenseNumber,
			String department, String role, List<String> languages, String bio, List<String> hospitals,
			List<DoctorAccountService.AvailabilityDay> availability, long totalCases, long activeCases,
			long completedCases, List<CaseRow> cases) {
	}

	public record CostLine(String label, BigDecimal amount) {
	}

	public record PlanSummary(String diagnosis, String treatmentType, String procedure, String technique,
			String description, String expectedOutcome, LocalDate startDate, LocalDate endDate, Integer durationDays,
			String lengthOfStay, String recoveryTime, String department, String roomCategory,
			String specialRequirements, BigDecimal doctorFeesAud, BigDecimal hospitalFeesAud, List<CostLine> costItems,
			BigDecimal totalAud, Instant submittedAt) {
	}

	public record LetterView(String type, String label, String fileName, Instant generatedAt, Instant sentAt) {

		static LetterView of(VisaDocument d) {
			return new LetterView(d.getCategory(), LETTER_LABELS.get(d.getCategory()), d.getFileName(),
					d.getUploadedAt(), d.getSentToPatientAt());
		}

	}

	public record CaseDetail(CaseRow row, String description, PatientInfo patient, DoctorSummary doctor,
			String assignmentStatus, PlanSummary plan, List<LetterView> letters) {
	}

	public record LetterFile(String fileName, Resource content) {
	}

}
