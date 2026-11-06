package com.iha.admin;

import java.util.Arrays;
import java.util.EnumSet;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.cases.CaseRepository;
import com.iha.cases.CaseStatus;
import com.iha.cases.CaseStatusService;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.doctor.DoctorCaseService;
import com.iha.notification.NotificationService;
import com.iha.provider.DoctorCaseAssignment;
import com.iha.provider.DoctorCaseAssignmentRepository;
import com.iha.provider.DoctorRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** Ends a case from the MTA side. Money is separate: refunds stay a decision on the Payments page. */
@Service
public class AdminCaseService {

	private static final Set<CaseStatus> CLOSABLE = EnumSet
		.copyOf(Arrays.stream(CaseStatus.values()).filter(CaseStatus::isInProgress).toList());

	private final CaseRepository cases;
	private final CaseStatusService caseStatus;
	private final DoctorCaseAssignmentRepository assignments;
	private final DoctorRepository doctors;
	private final NotificationService notifications;
	private final AuditService audit;

	AdminCaseService(CaseRepository cases, CaseStatusService caseStatus, DoctorCaseAssignmentRepository assignments,
			DoctorRepository doctors, NotificationService notifications, AuditService audit) {
		this.cases = cases;
		this.caseStatus = caseStatus;
		this.assignments = assignments;
		this.doctors = doctors;
		this.notifications = notifications;
		this.audit = audit;
	}

	/** The reason stays with MTA: patients and doctors get the standard message only. */
	@Transactional
	public void close(CurrentUser actor, UUID caseId, String reason) {
		MedicalCase medicalCase = require(caseId);
		if (!caseStatus.transition(medicalCase, CLOSABLE, CaseStatus.CLOSED, true)) {
			throw ApiException.conflict("invalid_case_status", "This case is already closed.");
		}
		medicalCase.close(reason.trim());
		assignments.findByCaseId(caseId).stream()
			.map(DoctorCaseAssignment::getDoctorId)
			.distinct()
			.forEach(doctorId -> doctors.findById(doctorId)
				.ifPresent(doctor -> notifications.notifyWithAlert(doctor.getUserId(), "case_closed", "Case closed",
						"Case " + medicalCase.getReferenceNumber() + " has been closed by MTA.", caseId)));
		audit.record(actor.id(), actor.email(), "admin", "case.closed", "case", caseId,
				Map.of("reason", reason.trim()));
	}

	/** For when the doctor can't: unlike the doctor's action, the treatment date isn't checked. */
	@Transactional
	public void complete(CurrentUser actor, UUID caseId) {
		caseStatus.transition(require(caseId), DoctorCaseService.COMPLETABLE, CaseStatus.COMPLETED, true);
		audit.record(actor.id(), actor.email(), "admin", "case.marked_completed", "case", caseId, Map.of());
	}

	private MedicalCase require(UUID caseId) {
		return cases.findById(caseId).orElseThrow(() -> ApiException.notFound("Case not found."));
	}

}
