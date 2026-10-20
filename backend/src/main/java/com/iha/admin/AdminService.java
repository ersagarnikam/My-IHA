package com.iha.admin;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.iha.cases.CaseDocument;
import com.iha.cases.CaseDocumentRepository;
import com.iha.cases.CaseRepository;
import com.iha.cases.CaseService;
import com.iha.cases.CaseStatus;
import com.iha.cases.MedicalCase;
import com.iha.chat.ChatService;
import com.iha.common.ApiException;
import com.iha.patient.Patient;
import com.iha.patient.PatientRepository;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorCaseAssignment;
import com.iha.provider.DoctorCaseAssignmentRepository;
import com.iha.provider.DoctorRepository;
import com.iha.provider.Hospital;
import com.iha.provider.HospitalRepository;
import com.iha.providerchat.ProviderMessageService;
import com.iha.storage.StorageService;
import com.iha.treatment.TreatmentPlan;
import com.iha.treatment.TreatmentPlanRepository;
import com.iha.treatment.TreatmentPlanSpecialist;
import com.iha.treatment.TreatmentPlanSpecialistRepository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Read side of the admin portal: what needs attention, doctors, cases, plans.
 * Changes go through the owning modules' services (DoctorAdminService,
 * ChatService, ProviderMessageService) so their rules and notifications apply.
 */
@Service
public class AdminService {

	/** Cases still looking for a doctor. */
	static final Set<CaseStatus> NEEDS_DOCTOR = EnumSet.of(CaseStatus.CASE_SUBMITTED, CaseStatus.UNDER_REVIEW);

	/** Suggested MTA service fee when publishing a plan. */
	static final BigDecimal DEFAULT_COMMISSION_RATE = new BigDecimal("0.10");

	private final DoctorRepository doctors;
	private final HospitalRepository hospitals;
	private final DoctorCaseAssignmentRepository assignments;
	private final CaseRepository cases;
	private final CaseDocumentRepository documents;
	private final PatientRepository patients;
	private final TreatmentPlanRepository plans;
	private final TreatmentPlanSpecialistRepository specialists;
	private final ChatService chat;
	private final ProviderMessageService providerMessages;
	private final StorageService storage;
	private final JsonMapper json;

	AdminService(DoctorRepository doctors, HospitalRepository hospitals, DoctorCaseAssignmentRepository assignments,
			CaseRepository cases, CaseDocumentRepository documents, PatientRepository patients,
			TreatmentPlanRepository plans, TreatmentPlanSpecialistRepository specialists, ChatService chat,
			ProviderMessageService providerMessages, StorageService storage, JsonMapper json) {
		this.doctors = doctors;
		this.hospitals = hospitals;
		this.assignments = assignments;
		this.cases = cases;
		this.documents = documents;
		this.patients = patients;
		this.plans = plans;
		this.specialists = specialists;
		this.chat = chat;
		this.providerMessages = providerMessages;
		this.storage = storage;
		this.json = json;
	}

	// ── Overview ────────────────────────────────────────────────────────────

	@Transactional(readOnly = true)
	public Overview overview() {
		List<MedicalCase> allCases = cases.findAll();
		Map<UUID, List<DoctorCaseAssignment>> byCase = assignments.findAll().stream()
			.collect(Collectors.groupingBy(DoctorCaseAssignment::getCaseId));
		long needDoctor = allCases.stream().filter(c -> needsDoctor(c, byCase.getOrDefault(c.getId(), List.of()))).count();
		long pendingDoctors = doctors.findAll().stream().filter(d -> Doctor.PENDING.equals(d.getStatus())).count();
		long plansToReview = plans.findAll().stream()
			.filter(p -> TreatmentPlan.SUBMITTED_TO_IHA.equals(p.getStatus()))
			.count();
		long chatsWaiting = chat.threadsForAdmin().stream()
			.filter(t -> t.unread() > 0 || (!t.thread().isOpen() && t.thread().getReopenRequestedAt() != null))
			.count()
				+ providerMessages.threadsForAdmin().stream()
					.filter(t -> t.unread() > 0 || (!t.thread().isOpen() && t.thread().getReopenRequestedAt() != null))
					.count();
		List<CaseRow> recent = caseRows(allCases.stream()
			.sorted(Comparator.comparing(MedicalCase::getCreatedAt).reversed())
			.limit(6)
			.toList());
		return new Overview(pendingDoctors, needDoctor, plansToReview, chatsWaiting, allCases.size(), recent);
	}

	// ── Doctors ─────────────────────────────────────────────────────────────

	@Transactional(readOnly = true)
	public List<Doctor> doctors() {
		return doctors.findAll().stream().sorted(Comparator.comparing(Doctor::getCreatedAt).reversed()).toList();
	}

	@Transactional(readOnly = true)
	public Doctor doctor(UUID doctorId) {
		return doctors.findById(doctorId).orElseThrow(() -> ApiException.notFound("Doctor not found."));
	}

	@Transactional(readOnly = true)
	public List<Hospital> hospitalsById(List<UUID> ids) {
		return hospitals.findAllById(ids);
	}

	// ── Cases ───────────────────────────────────────────────────────────────

	@Transactional(readOnly = true)
	public List<CaseRow> cases() {
		return caseRows(cases.findAll().stream().sorted(Comparator.comparing(MedicalCase::getCreatedAt).reversed()).toList());
	}

	@Transactional(readOnly = true)
	public CaseDetail caseDetail(UUID caseId) {
		MedicalCase c = cases.findById(caseId).orElseThrow(() -> ApiException.notFound("Case not found."));
		Patient patient = patients.findById(c.getPatientId()).orElse(null);
		List<DoctorCaseAssignment> list = assignments.findByCaseId(caseId);
		Map<UUID, Doctor> doctorById = byId(doctors.findAllById(list.stream().map(DoctorCaseAssignment::getDoctorId).toList()),
				Doctor::getId);
		Map<UUID, TreatmentPlan> planByDoctor = byId(plans.findByCaseId(caseId), TreatmentPlan::getDoctorId);
		List<AssignmentRow> rows = list.stream()
			.sorted(Comparator.comparing(DoctorCaseAssignment::getInvitedAt))
			.map(a -> new AssignmentRow(a, doctorById.get(a.getDoctorId()), planByDoctor.get(a.getDoctorId())))
			.toList();
		return new CaseDetail(c, patient, documents.findByCaseIdOrderByUploadedAtAsc(caseId), rows);
	}

	@Transactional(readOnly = true)
	public CaseService.StoredDocument caseDocument(UUID caseId, UUID documentId) {
		CaseDocument document = documents.findByIdAndCaseId(documentId, caseId)
			.orElseThrow(() -> ApiException.notFound("Document not found."));
		return new CaseService.StoredDocument(document, storage.load(document.getFilePath()));
	}

	/** Active doctors who can be invited to the case, those listing the case's specialty first. */
	@Transactional(readOnly = true)
	public List<Candidate> candidates(UUID caseId) {
		MedicalCase c = cases.findById(caseId).orElseThrow(() -> ApiException.notFound("Case not found."));
		Set<UUID> already = assignments.findByCaseId(caseId).stream()
			.map(DoctorCaseAssignment::getDoctorId)
			.collect(Collectors.toSet());
		return doctors.findAll().stream()
			.filter(Doctor::isActive)
			.filter(d -> !already.contains(d.getId()))
			.map(d -> new Candidate(d, d.getSpecialties() != null && List.of(d.getSpecialties()).contains(c.getSpecialty())))
			.sorted(Comparator.comparing(Candidate::matchesSpecialty).reversed()
				.thenComparing(x -> x.doctor().getFullName()))
			.toList();
	}

	// ── Treatment plans ─────────────────────────────────────────────────────

	@Transactional(readOnly = true)
	public List<PlanRow> plans(String status) {
		List<TreatmentPlan> list = plans.findAll().stream()
			.filter(p -> !p.isDraft())
			.filter(p -> status == null || status.isBlank() || status.equals(p.getStatus()))
			.sorted(Comparator.comparing((TreatmentPlan p) -> p.getSubmittedAt() == null ? p.getUpdatedAt() : p.getSubmittedAt())
				.reversed())
			.toList();
		Map<UUID, MedicalCase> caseById = byId(cases.findAllById(list.stream().map(TreatmentPlan::getCaseId).toList()),
				MedicalCase::getId);
		Map<UUID, Doctor> doctorById = byId(doctors.findAllById(list.stream().map(TreatmentPlan::getDoctorId).toList()),
				Doctor::getId);
		Map<UUID, Hospital> hospitalById = byId(hospitals.findAllById(
				list.stream().map(TreatmentPlan::getHospitalId).filter(Objects::nonNull).toList()), Hospital::getId);
		Map<UUID, List<TreatmentPlanSpecialist>> specialistsByPlan = specialists
			.findByTreatmentPlanIdIn(list.stream().map(TreatmentPlan::getId).toList())
			.stream()
			.collect(Collectors.groupingBy(TreatmentPlanSpecialist::getTreatmentPlanId));
		return list.stream()
			.map(p -> new PlanRow(p, caseById.get(p.getCaseId()), doctorById.get(p.getDoctorId()),
					p.getHospitalId() == null ? null : hospitalById.get(p.getHospitalId()),
					total(p, specialistsByPlan.getOrDefault(p.getId(), List.of()))))
			.toList();
	}

	@Transactional(readOnly = true)
	public PlanDetail plan(UUID planId) {
		TreatmentPlan p = plans.findById(planId).orElseThrow(() -> ApiException.notFound("Plan not found."));
		if (p.isDraft()) {
			throw ApiException.notFound("Plan not found.");
		}
		List<TreatmentPlanSpecialist> people = specialists.findByTreatmentPlanIdOrderByCreatedAtAsc(planId);
		BigDecimal total = total(p, people);
		return new PlanDetail(p, cases.findById(p.getCaseId()).orElse(null), doctors.findById(p.getDoctorId()).orElse(null),
				p.getHospitalId() == null ? null : hospitals.findById(p.getHospitalId()).orElse(null), costItems(p),
				people, total, total.multiply(DEFAULT_COMMISSION_RATE).setScale(0, RoundingMode.HALF_UP));
	}

	// ── Helpers ─────────────────────────────────────────────────────────────

	private List<CaseRow> caseRows(List<MedicalCase> list) {
		Map<UUID, Patient> patientById = byId(patients.findAllById(list.stream().map(MedicalCase::getPatientId).toList()),
				Patient::getId);
		Map<UUID, List<DoctorCaseAssignment>> byCase = list.isEmpty() ? Map.of()
				: assignments.findAll().stream().collect(Collectors.groupingBy(DoctorCaseAssignment::getCaseId));
		Map<UUID, Doctor> doctorById = byId(doctors.findAll(), Doctor::getId);
		return list.stream().map(c -> {
			List<DoctorCaseAssignment> mine = byCase.getOrDefault(c.getId(), List.of());
			Patient p = patientById.get(c.getPatientId());
			List<String> doctorNames = mine.stream()
				.filter(a -> DoctorCaseAssignment.INVITED.equals(a.getStatus()) || a.isAccepted())
				.map(a -> doctorById.get(a.getDoctorId()))
				.filter(Objects::nonNull)
				.map(Doctor::getFullName)
				.toList();
			return new CaseRow(c, p == null ? null : p.getFullName(), doctorNames, needsDoctor(c, mine));
		}).toList();
	}

	private static boolean needsDoctor(MedicalCase c, List<DoctorCaseAssignment> list) {
		return NEEDS_DOCTOR.contains(c.getStatus())
				&& list.stream().noneMatch(a -> DoctorCaseAssignment.INVITED.equals(a.getStatus()) || a.isAccepted());
	}

	private List<CostItem> costItems(TreatmentPlan p) {
		List<CostItem> items = new java.util.ArrayList<>();
		for (JsonNode n : json.readTree(p.getCostBreakdownJson()).path("items")) {
			items.add(new CostItem(n.path("label").asString(), n.path("amount").decimalValue()));
		}
		return items;
	}

	private BigDecimal total(TreatmentPlan p, List<TreatmentPlanSpecialist> people) {
		BigDecimal sum = nz(p.getDoctorFeesAud()).add(nz(p.getHospitalFeesAud()));
		for (CostItem item : costItems(p)) {
			sum = sum.add(nz(item.amount()));
		}
		for (TreatmentPlanSpecialist s : people) {
			sum = sum.add(nz(s.getCostAud()));
		}
		return sum;
	}

	private static BigDecimal nz(BigDecimal v) {
		return v == null ? BigDecimal.ZERO : v;
	}

	private static <T> Map<UUID, T> byId(List<T> list, Function<T, UUID> key) {
		return list.stream().collect(Collectors.toMap(key, Function.identity(), (a, b) -> a));
	}

	public record Overview(long pendingDoctors, long casesNeedingDoctor, long plansToReview, long chatsWaiting,
			long totalCases, List<CaseRow> recentCases) {
	}

	public record CaseRow(MedicalCase medicalCase, String patientName, List<String> doctorNames, boolean needsDoctor) {
	}

	public record AssignmentRow(DoctorCaseAssignment assignment, Doctor doctor, TreatmentPlan plan) {
	}

	public record CaseDetail(MedicalCase medicalCase, Patient patient, List<CaseDocument> documents,
			List<AssignmentRow> assignments) {
	}

	public record Candidate(Doctor doctor, boolean matchesSpecialty) {
	}

	public record CostItem(String label, BigDecimal amount) {
	}

	public record PlanRow(TreatmentPlan plan, MedicalCase medicalCase, Doctor doctor, Hospital hospital,
			BigDecimal totalAud) {
	}

	public record PlanDetail(TreatmentPlan plan, MedicalCase medicalCase, Doctor doctor, Hospital hospital,
			List<CostItem> costItems, List<TreatmentPlanSpecialist> specialists, BigDecimal totalAud,
			BigDecimal suggestedCommissionAud) {
	}

}
