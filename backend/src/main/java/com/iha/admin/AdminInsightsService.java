package com.iha.admin;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.Arrays;
import java.util.Collection;
import java.util.Comparator;
import java.util.EnumSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Set;
import java.util.TreeMap;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.iha.cases.CaseRepository;
import com.iha.cases.CaseStatus;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.consultation.ConsultationRequest;
import com.iha.consultation.ConsultationRequestRepository;
import com.iha.consultation.ConsultationService;
import com.iha.consultation.ConsultationSlot;
import com.iha.consultation.ConsultationSlotRepository;
import com.iha.doctor.DoctorFeePayment;
import com.iha.doctor.DoctorFeePaymentRepository;
import com.iha.patient.Patient;
import com.iha.patient.PatientRepository;
import com.iha.payment.Payment;
import com.iha.payment.PaymentRepository;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorCaseAssignment;
import com.iha.provider.DoctorCaseAssignmentRepository;
import com.iha.provider.DoctorRepository;
import com.iha.treatment.TreatmentOption;
import com.iha.treatment.TreatmentOptionRepository;
import com.iha.treatment.TreatmentPlan;
import com.iha.treatment.TreatmentPlanRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Figures for the admin dashboard and each doctor's performance, computed from
 * the live records only (no estimates): money received, the case pipeline,
 * doctor workload and responsiveness, specialty coverage and what's overdue.
 */
@Service
public class AdminInsightsService {

	static final ZoneId ZONE = ZoneId.of("Australia/Brisbane");

	/** An invitation without an answer for this long is flagged. */
	static final Duration STALE_INVITATION = Duration.ofHours(48);

	/** Annual fees due within this window are flagged. */
	static final Duration FEE_WARNING = Duration.ofDays(30);

	/** Plan outcomes the patient has decided on (same as the doctor dashboard). */
	private static final Set<String> DECIDED = Set.of(TreatmentPlan.PRESENTED_TO_PATIENT, TreatmentPlan.PATIENT_CONFIRMED,
			TreatmentPlan.NOT_SELECTED);

	private static final Set<String> SUBMITTED = Set.of(TreatmentPlan.SUBMITTED_TO_IHA, TreatmentPlan.IHA_REVIEW_IN_PROGRESS,
			TreatmentPlan.IHA_APPROVED, TreatmentPlan.PRESENTED_TO_PATIENT, TreatmentPlan.PATIENT_CONFIRMED,
			TreatmentPlan.NOT_SELECTED, TreatmentPlan.REJECTED_BY_IHA);

	private static final List<Stage> STAGES = List.of(
			new Stage("new", "New, needs a doctor", EnumSet.of(CaseStatus.CASE_SUBMITTED, CaseStatus.UNDER_REVIEW)),
			new Stage("doctor", "With a doctor", EnumSet.of(CaseStatus.DOCTOR_ASSIGNED, CaseStatus.EVALUATION)),
			new Stage("options", "Options with patient", EnumSet.of(CaseStatus.TREATMENT_PLAN)),
			new Stage("paid", "Confirmed & paid", EnumSet.of(CaseStatus.TREATMENT_CONFIRMED, CaseStatus.PAYMENT_CONFIRMED)),
			new Stage("visa", "Visa & travel",
					EnumSet.of(CaseStatus.VISA_DOCUMENTS_SUBMITTED, CaseStatus.VISA_PROCESSING, CaseStatus.TRAVEL_READY)),
			new Stage("completed", "Treated", EnumSet.of(CaseStatus.COMPLETED)),
			new Stage("closed", "Closed or visa refused", EnumSet.of(CaseStatus.CLOSED, CaseStatus.VISA_REJECTED)));

	private final AdminService admin;
	private final DoctorRepository doctors;
	private final DoctorCaseAssignmentRepository assignments;
	private final CaseRepository cases;
	private final PatientRepository patients;
	private final TreatmentPlanRepository plans;
	private final TreatmentOptionRepository options;
	private final PaymentRepository payments;
	private final DoctorFeePaymentRepository feePayments;
	private final ConsultationRequestRepository consultations;
	private final ConsultationSlotRepository slots;
	private final ConsultationService consultationService;

	AdminInsightsService(AdminService admin, DoctorRepository doctors, DoctorCaseAssignmentRepository assignments,
			CaseRepository cases, PatientRepository patients, TreatmentPlanRepository plans,
			TreatmentOptionRepository options, PaymentRepository payments, DoctorFeePaymentRepository feePayments,
			ConsultationRequestRepository consultations, ConsultationSlotRepository slots,
			ConsultationService consultationService) {
		this.admin = admin;
		this.doctors = doctors;
		this.assignments = assignments;
		this.cases = cases;
		this.patients = patients;
		this.plans = plans;
		this.options = options;
		this.payments = payments;
		this.feePayments = feePayments;
		this.consultations = consultations;
		this.slots = slots;
		this.consultationService = consultationService;
	}

	@Transactional(readOnly = true)
	public Insights insights() {
		Instant now = Instant.now();
		Snapshot s = snapshot();
		AdminService.Overview overview = admin.overview();

		// ── Platform ────────────────────────────────────────────────────────
		Instant monthStart = YearMonth.now(ZONE).atDay(1).atStartOfDay(ZONE).toInstant();
		long activeDoctors = s.doctors().stream().filter(Doctor::isActive).count();
		long awaitingFee = s.doctors().stream().filter(d -> d.isApproved() && !d.isActive()).count();
		long inProgress = s.cases().stream().filter(c -> c.getStatus().isInProgress()).count();
		long completed = s.cases().stream().filter(c -> c.getStatus() == CaseStatus.COMPLETED).count();
		long newThisMonth = s.cases().stream().filter(c -> c.getCreatedAt().isAfter(monthStart)).count();
		Platform platform = new Platform(activeDoctors, awaitingFee, patients.count(), s.cases().size(), inProgress,
				completed, newThisMonth);

		// ── Money (completed payments, last 12 months) ──────────────────────
		Instant yearAgo = now.minus(Duration.ofDays(365));
		List<Payment> paid = payments.findAll().stream()
			.filter(p -> p.isCompleted() && p.getPaidAt() != null)
			.toList();
		List<DoctorFeePayment> feesPaid = feePayments.findAll().stream()
			.filter(p -> DoctorFeePayment.COMPLETED.equals(p.getStatus()) && p.getPaidAt() != null)
			.toList();
		Map<UUID, TreatmentOption> optionById = byId(options.findAll(), TreatmentOption::getId);
		BigDecimal treatmentYear = BigDecimal.ZERO;
		BigDecimal consultationYear = BigDecimal.ZERO;
		BigDecimal serviceFeesYear = BigDecimal.ZERO;
		Map<YearMonth, BigDecimal[]> monthly = new LinkedHashMap<>();
		YearMonth thisMonth = YearMonth.now(ZONE);
		for (int i = 11; i >= 0; i--) {
			monthly.put(thisMonth.minusMonths(i), new BigDecimal[] { BigDecimal.ZERO, BigDecimal.ZERO });
		}
		for (Payment p : paid) {
			BigDecimal[] month = monthly.get(YearMonth.from(p.getPaidAt().atZone(ZONE)));
			if (month != null) {
				month[0] = month[0].add(p.getAmountAud());
			}
			if (!p.getPaidAt().isAfter(yearAgo)) {
				continue;
			}
			if (Payment.CONSULTATION_FEE.equals(p.getPaymentType())) {
				consultationYear = consultationYear.add(p.getAmountAud());
			}
			else {
				treatmentYear = treatmentYear.add(p.getAmountAud());
				TreatmentOption option = p.getTreatmentOptionId() == null ? null : optionById.get(p.getTreatmentOptionId());
				if (option != null) {
					serviceFeesYear = serviceFeesYear.add(nz(option.getMtaCommissionAud()));
				}
			}
		}
		BigDecimal membershipYear = BigDecimal.ZERO;
		for (DoctorFeePayment p : feesPaid) {
			BigDecimal[] month = monthly.get(YearMonth.from(p.getPaidAt().atZone(ZONE)));
			if (month != null) {
				month[1] = month[1].add(p.getAmountAud());
			}
			if (p.getPaidAt().isAfter(yearAgo)) {
				membershipYear = membershipYear.add(p.getAmountAud());
			}
		}
		Money money = new Money(treatmentYear, consultationYear, serviceFeesYear, membershipYear,
				monthly.entrySet().stream()
					.map(e -> new MonthAmount(e.getKey().toString(), e.getValue()[0], e.getValue()[1]))
					.toList());

		// ── Pipeline ───────────────────────────────────────────────────────
		Map<CaseStatus, Long> byStatus = s.cases().stream()
			.collect(Collectors.groupingBy(MedicalCase::getStatus, Collectors.counting()));
		List<StageCount> pipeline = STAGES.stream()
			.map(stage -> new StageCount(stage.key(), stage.label(),
					stage.statuses().stream().mapToLong(st -> byStatus.getOrDefault(st, 0L)).sum()))
			.toList();

		// ── Doctors ────────────────────────────────────────────────────────
		List<DoctorStats> doctorStats = s.doctors().stream()
			.filter(Doctor::isApproved)
			.map(d -> stats(d, s, now))
			.sorted(Comparator.comparingLong(DoctorStats::activeCases).reversed()
				.thenComparing(Comparator.comparingLong(DoctorStats::patientsTreated).reversed())
				.thenComparing(DoctorStats::fullName))
			.toList();
		Map<String, Long> doctorsByStatus = new LinkedHashMap<>();
		for (String status : List.of(Doctor.PENDING, Doctor.MORE_INFO_REQUESTED, Doctor.APPROVED, Doctor.REJECTED)) {
			doctorsByStatus.put(status, s.doctors().stream().filter(d -> status.equals(d.getStatus())).count());
		}

		// ── Specialty coverage: active doctors vs open cases ────────────────
		Map<String, long[]> coverage = new TreeMap<>(String.CASE_INSENSITIVE_ORDER);
		for (Doctor d : s.doctors()) {
			if (d.isActive()) {
				for (String sp : specialties(d)) {
					coverage.computeIfAbsent(sp, k -> new long[2])[0]++;
				}
			}
		}
		for (MedicalCase c : s.cases()) {
			if (c.getStatus().isInProgress()) {
				coverage.computeIfAbsent(specialty(c), k -> new long[2])[1]++;
			}
		}
		List<Coverage> specialtyCoverage = coverage.entrySet().stream()
			.map(e -> new Coverage(e.getKey(), e.getValue()[0], e.getValue()[1]))
			.sorted(Comparator.comparingLong(Coverage::openCases).reversed().thenComparing(Coverage::specialty))
			.toList();

		// ── Needs a nudge ──────────────────────────────────────────────────
		List<WaitingInvitation> waiting = s.assignments().stream()
			.filter(a -> DoctorCaseAssignment.INVITED.equals(a.getStatus()))
			.filter(a -> a.getInvitedAt().isBefore(now.minus(STALE_INVITATION)))
			.sorted(Comparator.comparing(DoctorCaseAssignment::getInvitedAt))
			.map(a -> {
				Doctor d = s.doctorById().get(a.getDoctorId());
				MedicalCase c = s.caseById().get(a.getCaseId());
				return new WaitingInvitation(a.getDoctorId(), d == null ? null : d.getFullName(), a.getCaseId(),
						c == null ? null : c.getReferenceNumber(), a.getInvitedAt());
			})
			.toList();
		List<FeeAlert> feeAlerts = s.doctors().stream()
			.filter(Doctor::isApproved)
			.map(d -> new FeeAlert(d.getId(), d.getFullName(), feeStatus(d, now), d.getAnnualFeeNextDueAt()))
			.filter(f -> !"paid".equals(f.status()))
			.sorted(Comparator.comparing(FeeAlert::status).thenComparing(FeeAlert::fullName))
			.toList();

		return new Insights(platform, new Attention(overview.pendingDoctors(), overview.casesNeedingDoctor(),
				overview.plansToReview(), overview.chatsWaiting()), money, pipeline, doctorsByStatus, doctorStats,
				specialtyCoverage, waiting, feeAlerts, upcoming(s, now));
	}

	/** One doctor's figures and cases, for the admin doctor page. */
	@Transactional(readOnly = true)
	public DoctorPerformance doctorPerformance(UUID doctorId) {
		Snapshot s = snapshot();
		Doctor doctor = s.doctorById().get(doctorId);
		if (doctor == null) {
			throw ApiException.notFound("Doctor not found.");
		}
		Instant now = Instant.now();
		Map<UUID, TreatmentPlan> planByCase = s.plans().stream()
			.filter(p -> p.getDoctorId().equals(doctorId))
			.collect(Collectors.toMap(TreatmentPlan::getCaseId, Function.identity(), (a, b) -> a));
		List<DoctorCase> caseList = s.assignments().stream()
			.filter(a -> a.getDoctorId().equals(doctorId))
			.sorted(Comparator.comparing(DoctorCaseAssignment::getInvitedAt).reversed())
			.map(a -> {
				MedicalCase c = s.caseById().get(a.getCaseId());
				TreatmentPlan plan = planByCase.get(a.getCaseId());
				return new DoctorCase(a.getCaseId(), c == null ? null : c.getReferenceNumber(),
						c == null ? null : specialty(c), c == null ? null : c.getStatus().dbValue(), a.getStatus(),
						a.getDeclineReason(), plan == null ? null : plan.getStatus(), a.getInvitedAt(),
						a.getRespondedAt(), a.getConsultationSkippedReason());
			})
			.toList();
		BigDecimal membership = feePayments.findByDoctorIdOrderByCreatedAtDesc(doctorId).stream()
			.filter(p -> DoctorFeePayment.COMPLETED.equals(p.getStatus()))
			.map(DoctorFeePayment::getAmountAud)
			.reduce(BigDecimal.ZERO, BigDecimal::add);
		return new DoctorPerformance(stats(doctor, s, now), membership, caseList);
	}

	// ── Helpers ─────────────────────────────────────────────────────────────

	private DoctorStats stats(Doctor d, Snapshot s, Instant now) {
		List<DoctorCaseAssignment> mine = s.assignmentsByDoctor().getOrDefault(d.getId(), List.of());
		List<TreatmentPlan> myPlans = s.plansByDoctor().getOrDefault(d.getId(), List.of());
		long accepted = mine.stream().filter(DoctorCaseAssignment::isAccepted).count();
		long declined = mine.stream().filter(a -> DoctorCaseAssignment.DECLINED.equals(a.getStatus())).count();
		long invited = mine.stream().filter(a -> DoctorCaseAssignment.INVITED.equals(a.getStatus())).count();
		long active = mine.stream()
			.filter(DoctorCaseAssignment::isAccepted)
			.map(a -> s.caseById().get(a.getCaseId()))
			.filter(c -> c != null && c.getStatus().isInProgress())
			.count();
		long treated = mine.stream()
			.filter(DoctorCaseAssignment::isAccepted)
			.map(a -> s.caseById().get(a.getCaseId()))
			.filter(c -> c != null && c.getStatus() == CaseStatus.COMPLETED)
			.count();
		List<Duration> responses = mine.stream()
			.filter(a -> a.getRespondedAt() != null)
			.map(a -> Duration.between(a.getInvitedAt(), a.getRespondedAt()))
			.toList();
		Double avgResponseHours = responses.isEmpty() ? null
				: Math.round(responses.stream().mapToLong(Duration::toMinutes).average().orElse(0) / 6.0) / 10.0;
		long submitted = myPlans.stream().filter(p -> SUBMITTED.contains(p.getStatus())).count();
		long decided = myPlans.stream().filter(p -> DECIDED.contains(p.getStatus())).count();
		long chosen = myPlans.stream().filter(p -> TreatmentPlan.PATIENT_CONFIRMED.equals(p.getStatus())).count();
		BigDecimal earned = myPlans.stream()
			.filter(p -> TreatmentPlan.PATIENT_CONFIRMED.equals(p.getStatus()) && s.paidCases().contains(p.getCaseId()))
			.map(p -> nz(p.getDoctorFeesAud()))
			.reduce(BigDecimal.ZERO, BigDecimal::add);
		Instant lastActivity = Stream.concat(
				mine.stream().flatMap(a -> Stream.of(a.getRespondedAt(), a.getEvaluationStartedAt(), a.getPlanSubmittedAt())),
				myPlans.stream().map(TreatmentPlan::getUpdatedAt))
			.filter(Objects::nonNull)
			.max(Comparator.naturalOrder())
			.orElse(null);
		return new DoctorStats(d.getId(), d.getFullName(), specialties(d), d.getStatus(), d.isActive(), d.getYearsExperience(),
				active, invited, mine.size(),
				accepted + declined == 0 ? null : (int) Math.round(accepted * 100.0 / (accepted + declined)),
				avgResponseHours, submitted, decided == 0 ? null : (int) Math.round(chosen * 100.0 / decided), treated,
				earned, lastActivity, feeStatus(d, now), d.getAnnualFeeNextDueAt());
	}

	/** unpaid (approved, registration fee not paid), overdue, due_soon or paid. */
	private static String feeStatus(Doctor d, Instant now) {
		if (d.getRegistrationFeePaidAt() == null) {
			return "unpaid";
		}
		Instant due = d.getAnnualFeeNextDueAt();
		if (due == null) {
			return "paid";
		}
		if (due.isBefore(now)) {
			return "overdue";
		}
		return due.isBefore(now.plus(FEE_WARNING)) ? "due_soon" : "paid";
	}

	private List<Upcoming> upcoming(Snapshot s, Instant now) {
		List<ConsultationRequest> scheduled = consultations.findAll().stream()
			.filter(r -> ConsultationRequest.SCHEDULED.equals(r.getStatus()) && r.getSelectedSlotId() != null)
			.toList();
		Map<UUID, ConsultationSlot> slotById = byId(
				slots.findByConsultationRequestIdInOrderBySlotTimeAsc(scheduled.stream().map(ConsultationRequest::getId).toList()),
				ConsultationSlot::getId);
		Map<UUID, Patient> patientById = byId(
				patients.findAllById(scheduled.stream().map(ConsultationRequest::getPatientId).distinct().toList()),
				Patient::getId);
		Instant horizon = now.plus(Duration.ofDays(14));
		return scheduled.stream()
			.map(r -> Map.entry(r, slotById.get(r.getSelectedSlotId())))
			.filter(e -> e.getValue() != null && e.getValue().getSlotEndTime().isAfter(now)
					&& e.getValue().getSlotTime().isBefore(horizon))
			.sorted(Comparator.comparing(e -> e.getValue().getSlotTime()))
			.limit(8)
			.map(e -> {
				ConsultationRequest r = e.getKey();
				MedicalCase c = s.caseById().get(r.getCaseId());
				Patient p = patientById.get(r.getPatientId());
				return new Upcoming(r.getId(), r.getKind(), r.getCaseId(), c == null ? null : c.getReferenceNumber(),
						p == null ? null : p.getFullName(),
						consultationService.doctorOf(r).map(Doctor::getFullName).orElse(null), e.getValue().getSlotTime(),
						e.getValue().getSlotEndTime());
			})
			.toList();
	}

	private Snapshot snapshot() {
		List<Doctor> allDoctors = doctors.findAll();
		List<MedicalCase> allCases = cases.findAll();
		List<DoctorCaseAssignment> allAssignments = assignments.findAll();
		List<TreatmentPlan> allPlans = plans.findAll();
		Set<UUID> paidCases = payments.findAll().stream()
			.filter(p -> Payment.FULL_PAYMENT.equals(p.getPaymentType()) && p.isCompleted())
			.map(Payment::getCaseId)
			.collect(Collectors.toSet());
		return new Snapshot(allDoctors, byId(allDoctors, Doctor::getId), allCases, byId(allCases, MedicalCase::getId),
				allAssignments, allAssignments.stream().collect(Collectors.groupingBy(DoctorCaseAssignment::getDoctorId)),
				allPlans, allPlans.stream().collect(Collectors.groupingBy(TreatmentPlan::getDoctorId)), paidCases);
	}

	private static List<String> specialties(Doctor d) {
		return d.getSpecialties() == null ? List.of() : Arrays.asList(d.getSpecialties());
	}

	private static String specialty(MedicalCase c) {
		return c.getSpecialtyOther() != null && !c.getSpecialtyOther().isBlank() ? c.getSpecialtyOther() : c.getSpecialty();
	}

	private static <T> Map<UUID, T> byId(Collection<T> list, Function<T, UUID> id) {
		return list.stream().collect(Collectors.toMap(id, Function.identity(), (a, b) -> a));
	}

	private static BigDecimal nz(BigDecimal value) {
		return value == null ? BigDecimal.ZERO : value;
	}

	private record Snapshot(List<Doctor> doctors, Map<UUID, Doctor> doctorById, List<MedicalCase> cases,
			Map<UUID, MedicalCase> caseById, List<DoctorCaseAssignment> assignments,
			Map<UUID, List<DoctorCaseAssignment>> assignmentsByDoctor, List<TreatmentPlan> plans,
			Map<UUID, List<TreatmentPlan>> plansByDoctor, Set<UUID> paidCases) {
	}

	private record Stage(String key, String label, Set<CaseStatus> statuses) {
	}

	public record Insights(Platform platform, Attention attention, Money money, List<StageCount> pipeline,
			Map<String, Long> doctorsByStatus, List<DoctorStats> doctors, List<Coverage> specialties,
			List<WaitingInvitation> waitingInvitations, List<FeeAlert> feeAlerts, List<Upcoming> upcomingConsultations) {
	}

	public record Platform(long activeDoctors, long doctorsAwaitingFee, long patients, long totalCases,
			long casesInProgress, long casesCompleted, long newCasesThisMonth) {
	}

	public record Attention(long pendingDoctors, long casesNeedingDoctor, long plansToReview, long chatsWaiting) {
	}

	/** Completed payments in the last 12 months; {@code monthly} covers the last 12 calendar months. */
	public record Money(BigDecimal treatmentPaymentsAud, BigDecimal consultationFeesAud, BigDecimal mtaServiceFeesAud,
			BigDecimal doctorMembershipFeesAud, List<MonthAmount> monthly) {
	}

	public record MonthAmount(String month, BigDecimal patientPaymentsAud, BigDecimal doctorFeesAud) {
	}

	public record StageCount(String key, String label, long count) {
	}

	/**
	 * @param invitationAcceptancePct accepted ÷ answered invitations
	 * @param planChosenPct patients choosing the plan ÷ plans the patient decided on
	 * @param doctorFeesEarnedAud doctor fees on plans the patient has paid for
	 */
	public record DoctorStats(UUID id, String fullName, List<String> specialties, String status, boolean active,
			Integer yearsOfExperience, long activeCases, long pendingInvitations, long totalInvitations,
			Integer invitationAcceptancePct, Double avgResponseHours, long plansSubmitted, Integer planChosenPct,
			long patientsTreated, BigDecimal doctorFeesEarnedAud, Instant lastActivityAt, String feeStatus,
			Instant annualFeeNextDueAt) {
	}

	public record Coverage(String specialty, long activeDoctors, long openCases) {
	}

	public record WaitingInvitation(UUID doctorId, String doctorName, UUID caseId, String referenceNumber,
			Instant invitedAt) {
	}

	public record FeeAlert(UUID doctorId, String fullName, String status, Instant annualFeeNextDueAt) {
	}

	public record Upcoming(UUID id, String kind, UUID caseId, String referenceNumber, String patientName,
			String doctorName, Instant startsAt, Instant endsAt) {
	}

	public record DoctorPerformance(DoctorStats stats, BigDecimal membershipFeesPaidAud, List<DoctorCase> cases) {
	}

	public record DoctorCase(UUID caseId, String referenceNumber, String specialty, String caseStatus,
			String assignmentStatus, String declineReason, String planStatus, Instant invitedAt, Instant respondedAt,
			String consultationSkippedReason) {
	}

}
