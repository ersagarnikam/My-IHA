package com.iha.hospital;

import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.common.ApiException;
import com.iha.notification.NotificationService;
import com.iha.provider.Hospital;
import com.iha.provider.HospitalRepository;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/** MTA admin's side of hospital accounts: listing and reviewing registrations. */
@Service
public class HospitalAdminService {

	static final Set<String> REVIEW_OUTCOMES = Set.of(Hospital.APPROVED, Hospital.REJECTED,
			Hospital.MORE_INFO_REQUESTED);

	private final HospitalRepository hospitals;
	private final NotificationService notifications;
	private final AuditService audit;

	HospitalAdminService(HospitalRepository hospitals, NotificationService notifications, AuditService audit) {
		this.hospitals = hospitals;
		this.notifications = notifications;
		this.audit = audit;
	}

	/** Hospitals with a portal login (seeded reference hospitals without one aren't reviewed). Newest first. */
	@Transactional(readOnly = true)
	public List<Hospital> registered() {
		return hospitals.findAll().stream()
			.filter(h -> h.getUserId() != null)
			.sorted(Comparator.comparing(Hospital::getCreatedAt).reversed())
			.toList();
	}

	@Transactional(readOnly = true)
	public Hospital hospital(UUID hospitalId) {
		return hospitals.findById(hospitalId).orElseThrow(() -> ApiException.notFound("Hospital not found."));
	}

	@Transactional(readOnly = true)
	public long pendingCount() {
		return hospitals.findAll().stream().filter(h -> Hospital.PENDING.equals(h.getStatus())).count();
	}

	/** Approve, reject (reason) or ask for more information (reason); the hospital is notified. {@code actor} null: seed data. */
	@Transactional
	public Hospital review(CurrentUser actor, UUID hospitalId, String outcome, String reason) {
		if (!REVIEW_OUTCOMES.contains(outcome)) {
			throw ApiException.badRequest("invalid_status", "Unknown review outcome.");
		}
		Hospital hospital = hospital(hospitalId);
		if (!Hospital.PENDING.equals(hospital.getStatus())) {
			throw ApiException.conflict("not_pending", "This registration isn't awaiting review.");
		}
		hospital.review(outcome, reason);
		if (hospital.getUserId() != null) {
			switch (outcome) {
				case Hospital.APPROVED -> notifications.notifyWithAlert(hospital.getUserId(), "registration_approved",
						"Registration approved",
						"Your MTA hospital registration has been approved. Your hospital portal is now open.", null);
				case Hospital.REJECTED -> notifications.notifyWithAlert(hospital.getUserId(), "registration_rejected",
						"Registration not approved", "Your MTA hospital registration was not approved."
								+ (reason != null ? " Reason: " + reason : ""),
						null);
				default -> notifications.notifyWithAlert(hospital.getUserId(), "registration_more_info",
						"More information needed",
						"MTA needs more information about your registration." + (reason != null ? " " + reason : ""),
						null);
			}
		}
		audit.record(actor == null ? null : actor.id(), actor == null ? null : actor.email(), "admin", "hospital.reviewed",
				"hospital", hospitalId,
				Map.of("outcome", outcome));
		return hospital;
	}

}
