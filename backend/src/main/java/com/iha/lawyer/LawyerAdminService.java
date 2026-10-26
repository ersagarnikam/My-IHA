package com.iha.lawyer;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.cases.CaseRepository;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.notification.NotificationService;
import com.iha.patient.Patient;
import com.iha.patient.PatientRepository;
import com.iha.provider.Lawyer;
import com.iha.provider.LawyerRepository;
import com.iha.verification.ProviderVerification;
import com.iha.verification.VerificationService;
import com.iha.visa.VisaSubmission;
import com.iha.visa.VisaSubmissionRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** MTA admin's side of visa lawyers: reviewing registrations and assigning visa cases. */
@Service
public class LawyerAdminService {

	static final Set<String> REVIEW_OUTCOMES = Set.of(Lawyer.APPROVED, Lawyer.REJECTED, Lawyer.MORE_INFO_REQUESTED);

	private final LawyerRepository lawyers;
	private final VisaSubmissionRepository submissions;
	private final CaseRepository cases;
	private final PatientRepository patients;
	private final VerificationService verification;
	private final NotificationService notifications;
	private final AuditService audit;

	LawyerAdminService(LawyerRepository lawyers, VisaSubmissionRepository submissions, CaseRepository cases,
			PatientRepository patients, VerificationService verification, NotificationService notifications,
			AuditService audit) {
		this.lawyers = lawyers;
		this.submissions = submissions;
		this.cases = cases;
		this.patients = patients;
		this.verification = verification;
		this.notifications = notifications;
		this.audit = audit;
	}

	/** Lawyers with a portal login, newest first. */
	@Transactional(readOnly = true)
	public List<Lawyer> registered() {
		return lawyers.findAll()
			.stream()
			.filter(l -> l.getUserId() != null)
			.sorted(Comparator.comparing(Lawyer::getCreatedAt).reversed())
			.toList();
	}

	@Transactional(readOnly = true)
	public Lawyer lawyer(UUID lawyerId) {
		return lawyers.findById(lawyerId).orElseThrow(() -> ApiException.notFound("Lawyer not found."));
	}

	@Transactional(readOnly = true)
	public long pendingCount() {
		return lawyers.findAll().stream().filter(l -> Lawyer.PENDING.equals(l.getStatus())).count();
	}

	/** Approve (needs a passing MARN / practising certificate check), reject or ask for more information. */
	@Transactional
	public Lawyer review(CurrentUser actor, UUID lawyerId, String outcome, String reason) {
		if (!REVIEW_OUTCOMES.contains(outcome)) {
			throw ApiException.badRequest("invalid_status", "Unknown review outcome.");
		}
		Lawyer lawyer = lawyer(lawyerId);
		if (!Lawyer.PENDING.equals(lawyer.getStatus())) {
			throw ApiException.conflict("not_pending", "This registration isn't awaiting review.");
		}
		if (Lawyer.APPROVED.equals(outcome)) {
			verification.requirePassing(ProviderVerification.LAWYER, lawyerId);
		}
		lawyer.review(outcome, reason);
		if (lawyer.getUserId() != null) {
			switch (outcome) {
				case Lawyer.APPROVED -> notifications.notifyWithAlert(lawyer.getUserId(), "registration_approved",
						"Registration approved",
						"Your MTA visa lawyer registration has been approved. Your portal is now open.", null);
				case Lawyer.REJECTED -> notifications.notifyWithAlert(lawyer.getUserId(), "registration_rejected",
						"Registration not approved", "Your MTA visa lawyer registration was not approved."
								+ (reason != null ? " Reason: " + reason : ""),
						null);
				default -> notifications.notifyWithAlert(lawyer.getUserId(), "registration_more_info",
						"More information needed",
						"MTA needs more information about your registration." + (reason != null ? " " + reason : ""),
						null);
			}
		}
		audit.record(actor == null ? null : actor.id(), actor == null ? null : actor.email(), "admin",
				"lawyer.reviewed", "lawyer", lawyerId, Map.of("outcome", outcome));
		return lawyer;
	}

	/** Submitted visa applications, unassigned first, then most recently updated. */
	@Transactional(readOnly = true)
	public List<VisaCase> visaCases() {
		List<VisaSubmission> all = submissions.findByStatusNotOrderByUpdatedAtDesc(VisaSubmission.NOT_STARTED);
		Map<UUID, MedicalCase> caseById = cases.findAllById(all.stream().map(VisaSubmission::getCaseId).toList())
			.stream()
			.collect(Collectors.toMap(MedicalCase::getId, Function.identity()));
		Map<UUID, Patient> patientById = patients
			.findAllById(all.stream().map(VisaSubmission::getPatientId).distinct().toList())
			.stream()
			.collect(Collectors.toMap(Patient::getId, Function.identity()));
		Map<UUID, Lawyer> lawyerById = lawyers.findAll()
			.stream()
			.collect(Collectors.toMap(Lawyer::getId, Function.identity()));
		return all.stream()
			.sorted(Comparator.comparing((VisaSubmission s) -> s.getAssignedLawyerId() != null))
			.map(s -> {
				MedicalCase c = caseById.get(s.getCaseId());
				Patient p = patientById.get(s.getPatientId());
				Lawyer l = s.getAssignedLawyerId() == null ? null : lawyerById.get(s.getAssignedLawyerId());
				return new VisaCase(s.getCaseId(), c == null ? null : c.getReferenceNumber(),
						p == null ? null : p.getFullName(), p == null ? null : p.getCountryOfResidence(), s.getStatus(),
						l == null ? null : l.getId(), l == null ? null : l.getName(), s.getUpdatedAt());
			})
			.toList();
	}

	@Transactional(readOnly = true)
	public long unassignedCount() {
		return submissions.findByStatusNotOrderByUpdatedAtDesc(VisaSubmission.NOT_STARTED)
			.stream()
			.filter(s -> s.getAssignedLawyerId() == null)
			.count();
	}

	/** Gives (or moves) a submitted visa application to an approved lawyer, who is notified. */
	@Transactional
	public VisaSubmission assign(CurrentUser actor, UUID caseId, UUID lawyerId) {
		VisaSubmission s = submissions.findByCaseId(caseId)
			.filter(VisaSubmission::isFormSubmitted)
			.orElseThrow(() -> ApiException.notFound("No submitted visa application for this case."));
		Lawyer lawyer = lawyer(lawyerId);
		if (!lawyer.isApproved()) {
			throw ApiException.conflict("lawyer_not_approved", "Only approved lawyers can be assigned.");
		}
		if (lawyerId.equals(s.getAssignedLawyerId())) {
			throw ApiException.conflict("already_assigned", "This lawyer already has the case.");
		}
		s.assignLawyer(lawyerId);
		MedicalCase c = cases.findById(caseId).orElseThrow();
		if (lawyer.getUserId() != null) {
			notifications.notifyWithAlert(lawyer.getUserId(), "visa_case_assigned", "New visa case assigned",
					"MTA assigned you the visa application for case %s.".formatted(c.getReferenceNumber()), caseId);
		}
		audit.record(actor == null ? null : actor.id(), actor == null ? null : actor.email(), "admin",
				"visa.lawyer_assigned", "case", caseId, Map.of("lawyer_id", lawyerId.toString()));
		return s;
	}

	public record VisaCase(UUID caseId, String referenceNumber, String patientName, String country, String status,
			UUID lawyerId, String lawyerName, java.time.Instant updatedAt) {
	}

}
