package com.iha.verification;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.iha.provider.Doctor;
import com.iha.provider.DoctorRepository;
import com.iha.provider.Hospital;
import com.iha.provider.HospitalRepository;
import com.iha.provider.Lawyer;
import com.iha.provider.LawyerRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Registrations, insurance, accreditation and licences of approved providers
 * that have lapsed or lapse within {@link #WARN_DAYS} days, for the admin
 * dashboard: the latest AHPRA / accreditation / licence / MARN / practising
 * certificate check, a doctor's indemnity declaration and the expiry dates
 * hospitals and lawyers declared.
 */
@Service
public class ComplianceService {

	static final int WARN_DAYS = 30;

	private static final ZoneId ZONE = ZoneId.of("Australia/Brisbane");

	private final DoctorRepository doctors;
	private final HospitalRepository hospitals;
	private final LawyerRepository lawyers;
	private final VerificationService verification;

	ComplianceService(DoctorRepository doctors, HospitalRepository hospitals, LawyerRepository lawyers,
			VerificationService verification) {
		this.doctors = doctors;
		this.hospitals = hospitals;
		this.lawyers = lawyers;
		this.verification = verification;
	}

	@Transactional(readOnly = true)
	public List<Alert> alerts() {
		LocalDate today = LocalDate.now(ZONE);
		List<Alert> alerts = new ArrayList<>();
		for (Doctor d : doctors.findAll()) {
			if (!d.isApproved()) {
				continue;
			}
			checks(alerts, ProviderVerification.DOCTOR, d.getId(), d.getFullName(), today);
			Doctor.Indemnity indemnity = d.getIndemnity();
			if (d.isActive()) {
				if (indemnity == null) {
					alerts.add(new Alert(ProviderVerification.DOCTOR, d.getId(), d.getFullName(), "indemnity",
							"Indemnity declaration", "missing", null));
				}
				else {
					dated(alerts, ProviderVerification.DOCTOR, d.getId(), d.getFullName(), "indemnity",
							"Indemnity insurance", indemnity.expiresOn(), today);
				}
			}
		}
		for (Hospital h : hospitals.findAll()) {
			if (h.getUserId() == null || !h.isApproved()) {
				continue;
			}
			checks(alerts, ProviderVerification.HOSPITAL, h.getId(), h.getName(), today);
			dated(alerts, ProviderVerification.HOSPITAL, h.getId(), h.getName(), "accreditation_declared",
					"Declared accreditation", h.getAccreditationExpiresOn(), today);
			dated(alerts, ProviderVerification.HOSPITAL, h.getId(), h.getName(), "licence_declared",
					"Declared licence", h.getLicenceExpiresOn(), today);
		}
		for (Lawyer l : lawyers.findAll()) {
			if (l.getUserId() == null || !l.isApproved()) {
				continue;
			}
			checks(alerts, ProviderVerification.LAWYER, l.getId(), l.getName(), today);
			dated(alerts, ProviderVerification.LAWYER, l.getId(), l.getName(), "credential_declared",
					"Declared credential", l.getCredentialExpiresOn(), today);
		}
		alerts.sort(Comparator.comparing((Alert a) -> !"expired".equals(a.status()))
			.thenComparing(Alert::date, Comparator.nullsFirst(Comparator.naturalOrder()))
			.thenComparing(Alert::name));
		return alerts;
	}

	private void checks(List<Alert> alerts, String type, UUID id, String name, LocalDate today) {
		Map<String, String> labels = verification.required(type, id);
		verification.current(type, id).forEach((check, v) -> {
			if (v == null) {
				alerts.add(new Alert(type, id, name, check, labels.get(check), "missing", null));
			}
			else if (ProviderVerification.FAILED.equals(v.getOutcome())) {
				alerts.add(new Alert(type, id, name, check, labels.get(check), "failed", v.getCheckedAt()
					.atZone(ZONE)
					.toLocalDate()));
			}
			else {
				dated(alerts, type, id, name, check, labels.get(check), v.getValidUntil(), today);
			}
		});
	}

	private static void dated(List<Alert> alerts, String type, UUID id, String name, String item, String label,
			LocalDate expires, LocalDate today) {
		if (expires == null) {
			return;
		}
		if (expires.isBefore(today)) {
			alerts.add(new Alert(type, id, name, item, label, "expired", expires));
		}
		else if (!expires.isAfter(today.plusDays(WARN_DAYS))) {
			alerts.add(new Alert(type, id, name, item, label, "expiring", expires));
		}
	}

	/** {@code status}: missing, failed, expired or expiring. */
	public record Alert(String providerType, UUID providerId, String name, String item, String label, String status,
			LocalDate date) {
	}

}
