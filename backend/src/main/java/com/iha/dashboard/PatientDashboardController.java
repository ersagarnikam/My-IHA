package com.iha.dashboard;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

import com.iha.auth.CurrentUser;
import com.iha.cases.CaseService;
import com.iha.cases.CaseStatus;
import com.iha.cases.MedicalCase;
import com.iha.patient.Patient;
import com.iha.patient.PatientService;
import com.iha.payment.Payment;
import com.iha.payment.PaymentService;
import com.iha.visa.VisaService;
import com.iha.visa.VisaSubmission;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/**
 * One call for the patient dashboard: in-progress cases with their document
 * count, latest payment and visa status (old {@code dashboard/page.tsx} loaders).
 */
@RestController
public class PatientDashboardController {

	private final PatientService patientService;
	private final CaseService caseService;
	private final PaymentService paymentService;
	private final VisaService visaService;

	public PatientDashboardController(PatientService patientService, CaseService caseService,
			PaymentService paymentService, VisaService visaService) {
		this.patientService = patientService;
		this.caseService = caseService;
		this.paymentService = paymentService;
		this.visaService = visaService;
	}

	@GetMapping("/api/patient/dashboard")
	@Transactional(readOnly = true)
	public Dashboard dashboard(@AuthenticationPrincipal Jwt jwt) {
		CurrentUser user = CurrentUser.from(jwt);
		Patient patient = patientService.requireCurrent(user);
		List<CaseService.CaseSummary> cases = caseService.listForPatient(user);
		List<UUID> activeIds = cases.stream()
			.map(CaseService.CaseSummary::medicalCase)
			.filter(c -> c.getStatus().isInProgress())
			.map(MedicalCase::getId)
			.toList();
		// Newest first, so the first payment seen per case is its latest.
		Map<UUID, Payment> latestPayment = paymentService.forCases(activeIds)
			.stream()
			.collect(Collectors.toMap(Payment::getCaseId, p -> p, (newer, older) -> newer));
		Map<UUID, VisaSubmission> visa = visaService.submissionsByCase(activeIds);

		List<CaseCard> cards = cases.stream().map(s -> {
			MedicalCase c = s.medicalCase();
			Payment p = latestPayment.get(c.getId());
			VisaSubmission v = visa.get(c.getId());
			return new CaseCard(c.getId(), c.getReferenceNumber(), c.getSpecialty(), c.getSpecialtyOther(),
					c.getStatus(), s.documentCount(), p == null ? null : p.getStatus(),
					p == null ? null : p.getAmountAud(), v == null ? null : v.getStatus(), c.getCreatedAt(),
					c.getUpdatedAt());
		}).toList();
		return new Dashboard(patient.getFullName(), patient.isProfileComplete(),
				cards.stream().filter(c -> c.status().isInProgress()).toList(), cards.stream().limit(4).toList(),
				cases.size());
	}

	public record Dashboard(String fullName, boolean profileComplete, List<CaseCard> activeCases,
			List<CaseCard> recentCases, int totalCases) {
	}

	public record CaseCard(UUID id, String referenceNumber, String specialty, String specialtyOther,
			CaseStatus status, long documentCount, String latestPaymentStatus, BigDecimal latestPaymentAmountAud,
			String visaStatus, Instant createdAt, Instant updatedAt) {
	}

}
