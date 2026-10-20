package com.iha.treatment;

import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.cases.CaseRepository;
import com.iha.cases.CaseService;
import com.iha.cases.CaseStatus;
import com.iha.cases.CaseStatusService;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.patient.Patient;
import com.iha.patient.PatientService;
import com.iha.treatment.TreatmentOptionViews.OptionView;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** What the patient sees of treatment options, and choosing one (old {@code confirm_treatment_option}). */
@Service
public class PatientTreatmentService {

	private final PatientService patientService;
	private final CaseService caseService;
	private final CaseRepository cases;
	private final CaseStatusService caseStatus;
	private final TreatmentOptionRepository options;
	private final TreatmentOptionViews views;
	private final AuditService audit;
	private final ApplicationEventPublisher events;

	PatientTreatmentService(PatientService patientService, CaseService caseService, CaseRepository cases,
			CaseStatusService caseStatus, TreatmentOptionRepository options, TreatmentOptionViews views,
			AuditService audit, ApplicationEventPublisher events) {
		this.patientService = patientService;
		this.caseService = caseService;
		this.cases = cases;
		this.caseStatus = caseStatus;
		this.options = options;
		this.views = views;
		this.audit = audit;
		this.events = events;
	}

	@Transactional(readOnly = true)
	public List<OptionView> optionsForCase(CurrentUser user, UUID caseId) {
		MedicalCase medicalCase = caseService.requireOwned(patientService.requireCurrent(user), caseId);
		return views.build(options.findByCaseIdAndPublishedAtIsNotNullOrderByCreatedAtAsc(medicalCase.getId()));
	}

	/** Every published option across the patient's cases (the /treatments page). */
	@Transactional(readOnly = true)
	public List<OptionView> allOptions(CurrentUser user) {
		Patient patient = patientService.requireCurrent(user);
		List<UUID> caseIds = cases.findByPatientIdOrderByCreatedAtDesc(patient.getId())
			.stream()
			.map(MedicalCase::getId)
			.toList();
		return caseIds.isEmpty() ? List.of()
				: views.build(options.findByCaseIdInAndPublishedAtIsNotNullOrderByCreatedAtAsc(caseIds));
	}

	@Transactional(readOnly = true)
	public OptionView option(CurrentUser user, UUID optionId) {
		return views.build(requireOwnedOption(patientService.requireCurrent(user), optionId));
	}

	@Transactional(readOnly = true)
	public OptionView selectedOptionForCase(CurrentUser user, UUID caseId) {
		MedicalCase medicalCase = caseService.requireOwned(patientService.requireCurrent(user), caseId);
		return options.findFirstByCaseIdAndSelectedTrue(medicalCase.getId())
			.map(views::build)
			.orElseThrow(() -> ApiException.notFound("No treatment option has been selected for this case."));
	}

	@Transactional
	public OptionView select(CurrentUser user, UUID optionId) {
		Patient patient = patientService.requireCurrent(user);
		TreatmentOption option = requireOwnedOption(patient, optionId);
		MedicalCase medicalCase = caseService.requireOwned(patient, option.getCaseId());
		if (medicalCase.getStatus() != CaseStatus.TREATMENT_PLAN) {
			throw ApiException.conflict("case_not_in_treatment_plan_status",
					"A treatment option can only be chosen while the case is at the treatment plan stage.");
		}
		option.select();
		caseStatus.transition(medicalCase, EnumSet.of(CaseStatus.TREATMENT_PLAN), CaseStatus.TREATMENT_CONFIRMED, true);
		OptionView view = views.build(option);
		events.publishEvent(new TreatmentOptionSelectedEvent(medicalCase.getId(), patient.getId(), option.getId(),
				view.costBreakdown().total()));
		audit.record(user.id(), user.email(), "patient", "treatment.option_selected", "treatment_option",
				option.getId(), Map.of("case_id", medicalCase.getId().toString()));
		return view;
	}

	/** A published option on one of the caller's cases. */
	public TreatmentOption requireOwnedOption(Patient patient, UUID optionId) {
		TreatmentOption option = options.findByIdAndPublishedAtIsNotNull(optionId)
			.orElseThrow(() -> ApiException.notFound("Treatment option not found."));
		caseService.requireOwned(patient, option.getCaseId());
		return option;
	}

}
