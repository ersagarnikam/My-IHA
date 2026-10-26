package com.iha.doctor;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.time.YearMonth;
import java.time.ZoneId;
import java.util.ArrayList;
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

import com.iha.auth.CurrentUser;
import com.iha.common.AustralianTimeZones;
import com.iha.cases.CaseRepository;
import com.iha.cases.CaseStatus;
import com.iha.cases.MedicalCase;
import com.iha.consultation.ConsultationRequest;
import com.iha.payment.Payment;
import com.iha.payment.PaymentRepository;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorCaseAssignment;
import com.iha.provider.DoctorCaseAssignmentRepository;
import com.iha.provider.DoctorRepository;
import com.iha.treatment.TreatmentPlan;
import com.iha.treatment.TreatmentPlanRepository;
import com.iha.treatment.TreatmentPlanSpecialist;
import com.iha.treatment.TreatmentPlanSpecialistRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Figures for the doctor dashboard: what MTA earned the doctor, how their
 * cases convert, how fast they respond, how their prices compare. Everything
 * is computed from real records; cross-doctor figures are anonymised
 * aggregates (medians, averages, percentiles) and never expose another
 * doctor's data.
 */
@Service
public class DoctorInsightsService {

	static final ZoneId ZONE = ZoneId.of("Australia/Brisbane");

	/** Plan statuses where the patient has made a decision about it. */
	private static final Set<String> DECIDED = Set.of(TreatmentPlan.PRESENTED_TO_PATIENT, TreatmentPlan.PATIENT_CONFIRMED,
			TreatmentPlan.NOT_SELECTED);

	private static final Set<CaseStatus> DONE = EnumSet.of(CaseStatus.COMPLETED);

	private final DoctorAccountService accounts;
	private final DoctorRepository doctors;
	private final DoctorCaseAssignmentRepository assignments;
	private final CaseRepository cases;
	private final TreatmentPlanRepository plans;
	private final TreatmentPlanSpecialistRepository specialists;
	private final DoctorPlanService planService;
	private final DoctorConsultationService consultations;
	private final PaymentRepository payments;
	private final DoctorFeePaymentRepository feePayments;
	private final CaseDocumentRequestRepository documentRequests;

	DoctorInsightsService(DoctorAccountService accounts, DoctorRepository doctors,
			DoctorCaseAssignmentRepository assignments, CaseRepository cases, TreatmentPlanRepository plans,
			TreatmentPlanSpecialistRepository specialists, DoctorPlanService planService,
			DoctorConsultationService consultations, PaymentRepository payments,
			DoctorFeePaymentRepository feePayments, CaseDocumentRequestRepository documentRequests) {
		this.accounts = accounts;
		this.doctors = doctors;
		this.assignments = assignments;
		this.cases = cases;
		this.plans = plans;
		this.specialists = specialists;
		this.planService = planService;
		this.consultations = consultations;
		this.payments = payments;
		this.feePayments = feePayments;
		this.documentRequests = documentRequests;
	}

	@Transactional(readOnly = true)
	public Insights insights(CurrentUser user) {
		Doctor doctor = accounts.requireActive(user);
		Instant now = Instant.now();
		Instant yearAgo = now.minus(Duration.ofDays(365));

		List<DoctorCaseAssignment> mine = assignments.findByDoctorIdOrderByInvitedAtDesc(doctor.getId());
		Map<UUID, MedicalCase> caseById = byId(cases.findAllById(mine.stream().map(DoctorCaseAssignment::getCaseId).toList()),
				MedicalCase::getId);
		List<DoctorCaseAssignment> accepted = mine.stream().filter(DoctorCaseAssignment::isAccepted).toList();

		List<TreatmentPlan> allPlans = plans.findAll();
		List<TreatmentPlan> myPlans = allPlans.stream().filter(p -> p.getDoctorId().equals(doctor.getId())).toList();
		Map<UUID, BigDecimal> totals = planTotals(allPlans);

		// ── Earnings: doctor fees on plans the patient chose and paid ──────
		Map<UUID, Instant> paidAtByCase = payments
			.findByCaseIdInOrderByCreatedAtDesc(myPlans.stream().map(TreatmentPlan::getCaseId).toList())
			.stream()
			.filter(p -> Payment.FULL_PAYMENT.equals(p.getPaymentType()) && p.isCompleted() && p.getPaidAt() != null)
			.collect(Collectors.toMap(Payment::getCaseId, Payment::getPaidAt, (a, b) -> a));
		List<TreatmentPlan> paidPlans = myPlans.stream()
			.filter(p -> TreatmentPlan.PATIENT_CONFIRMED.equals(p.getStatus()) && paidAtByCase.containsKey(p.getCaseId()))
			.toList();
		BigDecimal earnedYear = BigDecimal.ZERO;
		BigDecimal awaitingTreatment = BigDecimal.ZERO;
		BigDecimal treated = BigDecimal.ZERO;
		Map<YearMonth, BigDecimal> monthly = new LinkedHashMap<>();
		ZoneId zone = AustralianTimeZones.zone(doctor.getTimeZone());
		YearMonth thisMonth = YearMonth.now(zone);
		for (int i = 8; i >= 0; i--) {
			monthly.put(thisMonth.minusMonths(i), BigDecimal.ZERO);
		}
		for (TreatmentPlan plan : paidPlans) {
			BigDecimal fee = nz(plan.getDoctorFeesAud());
			Instant paidAt = paidAtByCase.get(plan.getCaseId());
			if (paidAt.isAfter(yearAgo)) {
				earnedYear = earnedYear.add(fee);
			}
			MedicalCase c = caseById.get(plan.getCaseId());
			if (c != null && DONE.contains(c.getStatus())) {
				treated = treated.add(fee);
			}
			else {
				awaitingTreatment = awaitingTreatment.add(fee);
			}
			monthly.computeIfPresent(YearMonth.from(paidAt.atZone(zone)), (m, v) -> v.add(fee));
		}
		BigDecimal feesPaid = feePayments.findByDoctorIdOrderByCreatedAtDesc(doctor.getId()).stream()
			.filter(p -> DoctorFeePayment.COMPLETED.equals(p.getStatus()))
			.map(DoctorFeePayment::getAmountAud)
			.reduce(BigDecimal.ZERO, BigDecimal::add);
		BigDecimal returnMultiple = feesPaid.signum() > 0 && earnedYear.signum() > 0
				? earnedYear.divide(feesPaid, 1, RoundingMode.HALF_UP) : null;

		long patientsTreated = accepted.stream()
			.map(a -> caseById.get(a.getCaseId()))
			.filter(Objects::nonNull)
			.filter(c -> DONE.contains(c.getStatus()))
			.count();

		// ── Activity ────────────────────────────────────────────────────────
		Instant quarterAgo = now.minus(Duration.ofDays(91));
		Instant twoQuartersAgo = now.minus(Duration.ofDays(182));
		long received = mine.stream().filter(a -> a.getInvitedAt().isAfter(yearAgo)).count();
		long lastQuarter = mine.stream().filter(a -> a.getInvitedAt().isAfter(quarterAgo)).count();
		long quarterBefore = mine.stream()
			.filter(a -> a.getInvitedAt().isAfter(twoQuartersAgo) && !a.getInvitedAt().isAfter(quarterAgo))
			.count();
		Integer receivedChangePct = quarterBefore > 0
				? (int) Math.round((lastQuarter - quarterBefore) * 100.0 / quarterBefore) : null;

		Integer acceptancePct = acceptance(myPlans);
		Integer platformAcceptancePct = acceptance(allPlans);

		List<Duration> responses = mine.stream()
			.filter(a -> a.getRespondedAt() != null)
			.map(a -> Duration.between(a.getInvitedAt(), a.getRespondedAt()))
			.toList();
		Double avgResponseHours = responses.isEmpty() ? null
				: Math.round(responses.stream().mapToLong(Duration::toMinutes).average().orElse(0) / 6.0) / 10.0;

		// ── Funnel and outcomes ─────────────────────────────────────────────
		Set<UUID> consultedCases = consultations.requestsForDoctor(doctor).stream()
			.filter(r -> ConsultationRequest.SCHEDULED.equals(r.getStatus()))
			.map(ConsultationRequest::getCaseId)
			.collect(Collectors.toSet());
		List<FunnelStep> funnel = List.of(new FunnelStep("Assigned", mine.size()),
				new FunnelStep("Accepted", accepted.size()), new FunnelStep("Consulted", consultedCases.size()),
				new FunnelStep("Plan sent", mine.stream().filter(a -> a.getPlanSubmittedAt() != null).count()),
				new FunnelStep("Chosen by patient",
						myPlans.stream().filter(p -> TreatmentPlan.PATIENT_CONFIRMED.equals(p.getStatus())).count()),
				new FunnelStep("Treated", patientsTreated));

		List<Reason> declines = new ArrayList<>();
		declines.add(new Reason("Chose another doctor",
				myPlans.stream().filter(p -> TreatmentPlan.NOT_SELECTED.equals(p.getStatus())).count()));
		declines.add(new Reason("Plan declined by MTA",
				myPlans.stream().filter(p -> TreatmentPlan.REJECTED_BY_IHA.equals(p.getStatus())).count()));
		declines.add(new Reason("Visa rejected", accepted.stream()
			.map(a -> caseById.get(a.getCaseId()))
			.filter(c -> c != null && c.getStatus() == CaseStatus.VISA_REJECTED)
			.count()));
		declines.add(new Reason("You declined the case",
				mine.stream().filter(a -> DoctorCaseAssignment.DECLINED.equals(a.getStatus())).count()));

		// ── Price benchmark by specialty (anonymised medians) ───────────────
		Map<UUID, MedicalCase> allCases = byId(cases.findAllById(allPlans.stream().map(TreatmentPlan::getCaseId).toList()),
				MedicalCase::getId);
		List<Benchmark> benchmark = benchmark(doctor, allPlans, allCases, totals);
		String insight = benchmark.stream()
			.filter(b -> b.platformMedianAud() != null && b.differencePct() != null && Math.abs(b.differencePct()) >= 10)
			.max(Comparator.comparingInt(b -> Math.abs(b.differencePct())))
			.map(b -> "Your %s plans are %d%% %s the platform median.".formatted(b.specialty(),
					Math.abs(b.differencePct()), b.differencePct() > 0 ? "above" : "below"))
			.orElse(null);

		// ── Rank among doctors sharing the main specialty ───────────────────
		String mainSpecialty = doctor.getSpecialties() != null && doctor.getSpecialties().length > 0
				? doctor.getSpecialties()[0] : null;
		Integer topPercent = rank(doctor, mainSpecialty, patientsTreated);

		// ── Recent patient uploads for the action list ───────────────────────
		Instant weekAgo = now.minus(Duration.ofDays(7));
		List<RecentUpload> uploads = accepted.stream()
			.map(a -> caseById.get(a.getCaseId()))
			.filter(Objects::nonNull)
			.map(c -> new RecentUpload(c.getId(), c.getReferenceNumber(),
					documentRequests.findByCaseIdOrderByRequestedAtDesc(c.getId()).stream()
						.filter(r -> r.getReceivedAt() != null && r.getReceivedAt().isAfter(weekAgo))
						.count()))
			.filter(u -> u.count() > 0)
			.toList();

		return new Insights(new Money(earnedYear, awaitingTreatment, treated, feesPaid, returnMultiple,
				monthly.entrySet().stream().map(e -> new MonthAmount(e.getKey().toString(), e.getValue())).toList()),
				patientsTreated, mainSpecialty, topPercent, received, receivedChangePct, acceptancePct,
				platformAcceptancePct, avgResponseHours, profileStrength(doctor), funnel, declines, benchmark, insight,
				uploads, verification(doctor));
	}

	private Integer acceptance(Collection<TreatmentPlan> list) {
		long decided = list.stream().filter(p -> DECIDED.contains(p.getStatus())).count();
		long chosen = list.stream().filter(p -> TreatmentPlan.PATIENT_CONFIRMED.equals(p.getStatus())).count();
		return decided == 0 ? null : (int) Math.round(chosen * 100.0 / decided);
	}

	private Map<UUID, BigDecimal> planTotals(List<TreatmentPlan> list) {
		Map<UUID, BigDecimal> specialistTotals = specialists
			.findByTreatmentPlanIdIn(list.stream().map(TreatmentPlan::getId).toList())
			.stream()
			.collect(Collectors.groupingBy(TreatmentPlanSpecialist::getTreatmentPlanId,
					Collectors.reducing(BigDecimal.ZERO, s -> nz(s.getCostAud()), BigDecimal::add)));
		Map<UUID, BigDecimal> totals = new LinkedHashMap<>();
		for (TreatmentPlan p : list) {
			BigDecimal items = planService.costItems(p.getCostBreakdownJson()).stream()
				.map(i -> nz(i.amount()))
				.reduce(BigDecimal.ZERO, BigDecimal::add);
			totals.put(p.getId(), nz(p.getDoctorFeesAud()).add(nz(p.getHospitalFeesAud()))
				.add(items)
				.add(specialistTotals.getOrDefault(p.getId(), BigDecimal.ZERO)));
		}
		return totals;
	}

	/**
	 * The doctor's median plan total per specialty against the median of every
	 * other doctor's submitted plans in it. Only shown when at least two other
	 * doctors' plans exist, so no single doctor's price can be inferred.
	 */
	private List<Benchmark> benchmark(Doctor doctor, List<TreatmentPlan> allPlans, Map<UUID, MedicalCase> caseById,
			Map<UUID, BigDecimal> totals) {
		Map<String, List<TreatmentPlan>> bySpecialty = allPlans.stream()
			.filter(p -> !p.isDraft() && caseById.containsKey(p.getCaseId()))
			.collect(Collectors.groupingBy(p -> specialtyOf(caseById.get(p.getCaseId())), LinkedHashMap::new,
					Collectors.toList()));
		List<Benchmark> rows = new ArrayList<>();
		bySpecialty.forEach((specialty, list) -> {
			List<BigDecimal> mine = list.stream()
				.filter(p -> p.getDoctorId().equals(doctor.getId()))
				.map(p -> totals.get(p.getId()))
				.toList();
			if (mine.isEmpty()) {
				return;
			}
			List<TreatmentPlan> others = list.stream().filter(p -> !p.getDoctorId().equals(doctor.getId())).toList();
			long otherDoctors = others.stream().map(TreatmentPlan::getDoctorId).distinct().count();
			BigDecimal yours = median(mine);
			BigDecimal platform = otherDoctors >= 2 ? median(others.stream().map(p -> totals.get(p.getId())).toList())
					: null;
			Integer diff = platform != null && platform.signum() > 0
					? yours.subtract(platform).multiply(BigDecimal.valueOf(100)).divide(platform, 0, RoundingMode.HALF_UP)
						.intValue()
					: null;
			rows.add(new Benchmark(specialty, mine.size(), yours, platform, diff));
		});
		return rows;
	}

	private Integer rank(Doctor doctor, String specialty, long treated) {
		if (specialty == null || treated == 0) {
			return null;
		}
		List<Doctor> peers = doctors.findAll().stream()
			.filter(Doctor::isActive)
			.filter(d -> d.getSpecialties() != null && List.of(d.getSpecialties()).contains(specialty))
			.toList();
		if (peers.size() < 3) {
			return null;
		}
		Map<UUID, Long> treatedByDoctor = new LinkedHashMap<>();
		for (Doctor peer : peers) {
			List<UUID> peerCases = assignments.findByDoctorIdOrderByInvitedAtDesc(peer.getId()).stream()
				.filter(DoctorCaseAssignment::isAccepted)
				.map(DoctorCaseAssignment::getCaseId)
				.toList();
			treatedByDoctor.put(peer.getId(),
					cases.findAllById(peerCases).stream().filter(c -> DONE.contains(c.getStatus())).count());
		}
		long ahead = treatedByDoctor.values().stream().filter(v -> v > treated).count();
		return (int) Math.max(1, Math.ceil((ahead + 1) * 100.0 / peers.size()));
	}

	/** Share of the profile a patient would see that's filled in. */
	private int profileStrength(Doctor d) {
		List<Boolean> checks = List.of(d.getPhotoUrl() != null, notBlank(d.getBio()), d.getDateOfBirth() != null,
				notBlank(d.getGender()), notBlank(d.getContactPhone()), notBlank(d.getQualifications()),
				d.getLanguagesSpoken() != null && d.getLanguagesSpoken().length > 0, !accounts.hospitalIds(d).isEmpty(),
				d.getAvailabilityScheduleJson().trim().startsWith("[") && d.getAvailabilityScheduleJson().length() > 2,
				notBlank(d.getLicenseNumber()));
		return (int) Math.round(checks.stream().filter(b -> b).count() * 100.0 / checks.size());
	}

	private List<Check> verification(Doctor d) {
		List<DoctorAccountService.RegistrationDocument> docs = accounts.documents(d);
		boolean degree = docs.stream().anyMatch(x -> "degree_certificate".equals(x.category()));
		return List.of(new Check("AHPRA licence", d.isApproved() && notBlank(d.getLicenseNumber()) ? "verified" : "pending"),
				new Check("Qualifications", d.isApproved() && degree ? "verified" : "pending"),
				new Check("Indemnity insurance", "not_provided"));
	}

	private static String specialtyOf(MedicalCase c) {
		return c.getSpecialtyOther() != null && "Other".equals(c.getSpecialty()) ? c.getSpecialtyOther()
				: c.getSpecialty();
	}

	private static BigDecimal median(List<BigDecimal> values) {
		List<BigDecimal> sorted = values.stream().sorted().toList();
		int n = sorted.size();
		return n % 2 == 1 ? sorted.get(n / 2)
				: sorted.get(n / 2 - 1).add(sorted.get(n / 2)).divide(BigDecimal.valueOf(2), 2, RoundingMode.HALF_UP);
	}

	private static BigDecimal nz(BigDecimal v) {
		return v == null ? BigDecimal.ZERO : v;
	}

	private static boolean notBlank(String s) {
		return s != null && !s.isBlank();
	}

	private static <T> Map<UUID, T> byId(List<T> list, Function<T, UUID> key) {
		return list.stream().collect(Collectors.toMap(key, Function.identity(), (a, b) -> a));
	}

	public record Insights(Money money, long patientsTreated, String mainSpecialty, Integer specialtyTopPercent,
			long casesReceived, Integer casesReceivedChangePct, Integer planAcceptancePct,
			Integer platformPlanAcceptancePct, Double avgResponseHours, int profileStrengthPct,
			List<FunnelStep> funnel, List<Reason> declineReasons, List<Benchmark> benchmark, String benchmarkInsight,
			List<RecentUpload> recentUploads, List<Check> verification) {
	}

	/**
	 * @param earnedYearAud doctor fees on plans patients paid for in the last 12 months
	 * @param awaitingTreatmentAud paid, treatment not completed yet
	 * @param treatedAud paid and treatment completed
	 * @param feesPaidAud registration + annual fees the doctor has paid MTA
	 */
	public record Money(BigDecimal earnedYearAud, BigDecimal awaitingTreatmentAud, BigDecimal treatedAud,
			BigDecimal feesPaidAud, BigDecimal returnMultiple, List<MonthAmount> monthly) {
	}

	public record MonthAmount(String month, BigDecimal amountAud) {
	}

	public record FunnelStep(String label, long count) {
	}

	public record Reason(String label, long count) {
	}

	public record Benchmark(String specialty, int yourPlans, BigDecimal yourMedianAud, BigDecimal platformMedianAud,
			Integer differencePct) {
	}

	public record RecentUpload(UUID caseId, String referenceNumber, long count) {
	}

	public record Check(String label, String state) {
	}

}
