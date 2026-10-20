package com.iha.treatment;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorRepository;
import com.iha.provider.Hospital;
import com.iha.provider.HospitalRepository;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

import org.springframework.stereotype.Component;

/**
 * Builds the patient-facing view of treatment options, the same flattened shape
 * as the old {@code flattenTreatmentOption}: plan details, hospital, doctor,
 * specialists and an itemised cost breakdown whose total is what the patient pays.
 */
@Component
public class TreatmentOptionViews {

	private final TreatmentPlanRepository plans;
	private final TreatmentPlanSpecialistRepository specialists;
	private final HospitalRepository hospitals;
	private final DoctorRepository doctors;
	private final JsonMapper jsonMapper;

	TreatmentOptionViews(TreatmentPlanRepository plans, TreatmentPlanSpecialistRepository specialists,
			HospitalRepository hospitals, DoctorRepository doctors, JsonMapper jsonMapper) {
		this.plans = plans;
		this.specialists = specialists;
		this.hospitals = hospitals;
		this.doctors = doctors;
		this.jsonMapper = jsonMapper;
	}

	public List<OptionView> build(Collection<TreatmentOption> options) {
		if (options.isEmpty()) {
			return List.of();
		}
		Map<UUID, TreatmentPlan> planById = byId(plans.findAllById(ids(options, TreatmentOption::getTreatmentPlanId)),
				TreatmentPlan::getId);
		Map<UUID, List<TreatmentPlanSpecialist>> specialistsByPlan = specialists
			.findByTreatmentPlanIdIn(planById.keySet())
			.stream()
			.collect(Collectors.groupingBy(TreatmentPlanSpecialist::getTreatmentPlanId));
		Map<UUID, Hospital> hospitalById = byId(
				hospitals.findAllById(ids(planById.values(), TreatmentPlan::getHospitalId)), Hospital::getId);
		Map<UUID, Doctor> doctorById = byId(doctors.findAllById(ids(planById.values(), TreatmentPlan::getDoctorId)),
				Doctor::getId);

		return options.stream().map(option -> {
			TreatmentPlan plan = planById.get(option.getTreatmentPlanId());
			List<TreatmentPlanSpecialist> planSpecialists = specialistsByPlan.getOrDefault(plan.getId(), List.of());
			return toView(option, plan, planSpecialists, hospitalById.get(plan.getHospitalId()),
					doctorById.get(plan.getDoctorId()));
		}).toList();
	}

	public OptionView build(TreatmentOption option) {
		return build(List.of(option)).get(0);
	}

	private OptionView toView(TreatmentOption option, TreatmentPlan plan, List<TreatmentPlanSpecialist> planSpecialists,
			Hospital hospital, Doctor doctor) {
		return new OptionView(option.getId(), option.getCaseId(), plan.getId(), plan.getHospitalId(),
				plan.getDoctorId(), Objects.requireNonNullElse(
						plan.getDescription() != null ? plan.getDescription() : plan.getProcedureName(), ""),
				costBreakdown(option, plan, planSpecialists), plan.getDiagnosis(), plan.getTreatmentType(),
				plan.getProcedureName(), plan.getDescription(), plan.getExpectedOutcome(), plan.getTechnique(),
				plan.getSuccessRate(), plan.getTreatmentStartDate(), plan.getTreatmentEndDate(),
				plan.getTreatmentDurationDays(), plan.getRecoveryTime(), plan.getEstimatedLengthOfStay(),
				plan.getDepartment(), plan.getRoomCategory(), plan.getSpecialRequirements(),
				plan.getPatientInstructions(), plan.getCostNotes(),
				planSpecialists.stream()
					.map(s -> new SpecialistView(s.getSpecialistType(), s.getSpecialistName(), s.getCostAud(),
							s.getNotes()))
					.toList(),
				plan.getAftercare() == null ? List.of() : plan.getAftercare(), option.isSelected(),
				option.getPublishedAt(), option.getCreatedAt(),
				hospital == null ? null
						: new HospitalView(hospital.getName(), hospital.getCity(), hospital.getCountry(),
								hospital.getBedCount(), list(hospital.getSpecialties())),
				doctor == null ? null
						: new DoctorView(doctor.getFullName(), list(doctor.getSpecialties()), doctor.getQualifications(),
								doctor.getPhotoUrl(), doctor.getYearsExperience()));
	}

	/** Doctor fees, hospital fees, extra plan items, specialists, then the IHA service fee. */
	CostBreakdown costBreakdown(TreatmentOption option, TreatmentPlan plan, List<TreatmentPlanSpecialist> planSpecialists) {
		List<CostItem> items = new ArrayList<>();
		if (isPositive(plan.getDoctorFeesAud())) {
			items.add(new CostItem("Doctor Fees", plan.getDoctorFeesAud(), "doctor_fees"));
		}
		if (isPositive(plan.getHospitalFeesAud())) {
			items.add(new CostItem("Hospital Fees", plan.getHospitalFeesAud(), "hospital_fees"));
		}
		JsonNode extra = jsonMapper.readTree(plan.getCostBreakdownJson()).path("items");
		for (JsonNode item : extra) {
			items.add(new CostItem(item.path("label").asString(), item.path("amount").decimalValue(), null));
		}
		for (TreatmentPlanSpecialist s : planSpecialists) {
			String label = s.getSpecialistName() != null
					? "%s (%s)".formatted(s.getSpecialistType(), s.getSpecialistName()) : s.getSpecialistType();
			items.add(new CostItem(label, s.getCostAud(), null));
		}
		if (isPositive(option.getMtaCommissionAud())) {
			items.add(new CostItem("IHA Service Fee", option.getMtaCommissionAud(), "iha_service_fee"));
		}
		BigDecimal total = items.stream().map(CostItem::amount).reduce(BigDecimal.ZERO, BigDecimal::add);
		return new CostBreakdown(items, total);
	}

	private static boolean isPositive(BigDecimal value) {
		return value != null && value.signum() > 0;
	}

	private static List<String> list(String[] values) {
		return values == null ? List.of() : List.of(values);
	}

	private static <T> List<UUID> ids(Collection<T> items, Function<T, UUID> id) {
		return items.stream().map(id).filter(Objects::nonNull).distinct().toList();
	}

	private static <T> Map<UUID, T> byId(List<T> items, Function<T, UUID> id) {
		return items.stream().collect(Collectors.toMap(id, Function.identity()));
	}

	@JsonInclude(JsonInclude.Include.NON_NULL)
	public record CostItem(String label, BigDecimal amount, String labelKey) {
	}

	public record CostBreakdown(List<CostItem> items, BigDecimal total) {
	}

	public record SpecialistView(String specialistType, String specialistName, BigDecimal costAud, String notes) {
	}

	public record HospitalView(String name, String city, String country, Integer bedCount, List<String> specialties) {
	}

	public record DoctorView(String fullName, List<String> specialties, String qualifications, String photoUrl,
			Integer yearsExperience) {
	}

	public record OptionView(UUID id, UUID caseId, UUID treatmentPlanId, UUID hospitalId, UUID doctorId,
			String treatmentSummary, CostBreakdown costBreakdown, String diagnosis, String treatmentType,
			String procedureName, String description, String expectedOutcome, String technique, String successRate,
			LocalDate treatmentStartDate, LocalDate treatmentEndDate, Integer treatmentDurationDays,
			String recoveryTime, String hospitalStay, String department, String roomCategory,
			String specialRequirements, String patientInstructions, String costNotes,
			List<SpecialistView> specialists, List<String> aftercare, boolean selected, Instant publishedAt,
			Instant createdAt, HospitalView hospital, DoctorView doctor) {
	}

}
