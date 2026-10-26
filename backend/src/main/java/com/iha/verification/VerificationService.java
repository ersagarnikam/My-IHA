package com.iha.verification;

import java.time.LocalDate;
import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.common.ApiException;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Checks MTA staff make against public registers before approving a provider,
 * and again when registrations renew: a doctor's entry on the AHPRA public
 * register (there is no public AHPRA API, so staff search it and record what
 * they found), a hospital's NSQHS accreditation and its state private-hospital
 * licence. The latest check of each kind is the current one.
 */
@Service
public class VerificationService {

	/** The checks each kind of provider needs, with their labels. */
	public static final Map<String, Map<String, String>> REQUIRED = Map.of(
			ProviderVerification.DOCTOR, label(ProviderVerification.AHPRA, "AHPRA registration"),
			ProviderVerification.HOSPITAL, labels());

	/** The AHPRA public register search. */
	public static final String AHPRA_REGISTER_URL = "https://www.ahpra.gov.au/Registration/Registers-of-Practitioners.aspx";

	static final Set<String> OUTCOMES = Set.of(ProviderVerification.VERIFIED,
			ProviderVerification.VERIFIED_WITH_CONDITIONS, ProviderVerification.FAILED);

	private static final ZoneId ZONE = ZoneId.of("Australia/Brisbane");

	private final ProviderVerificationRepository verifications;
	private final AuditService audit;

	VerificationService(ProviderVerificationRepository verifications, AuditService audit) {
		this.verifications = verifications;
		this.audit = audit;
	}

	@Transactional
	public ProviderVerification record(CurrentUser actor, String providerType, UUID providerId, String checkType,
			String outcome, LocalDate validUntil, String details) {
		Map<String, String> required = REQUIRED.get(providerType);
		if (required == null || !required.containsKey(checkType)) {
			throw ApiException.badRequest("invalid_check", "Unknown check for this provider.");
		}
		if (!OUTCOMES.contains(outcome)) {
			throw ApiException.badRequest("invalid_outcome", "Choose what the check found.");
		}
		String cleanDetails = details == null || details.isBlank() ? null : details.trim();
		if (!ProviderVerification.FAILED.equals(outcome) && validUntil == null) {
			throw ApiException.badRequest("valid_until_required", "Enter the date the registration is valid until.");
		}
		if (ProviderVerification.VERIFIED_WITH_CONDITIONS.equals(outcome) && cleanDetails == null) {
			throw ApiException.badRequest("details_required", "Describe the conditions or restrictions.");
		}
		ProviderVerification saved = verifications.save(new ProviderVerification(providerType, providerId, checkType,
				outcome, validUntil, cleanDetails, actor == null ? null : actor.email()));
		audit.record(actor == null ? null : actor.id(), actor == null ? null : actor.email(), "admin",
				"provider.verified", providerType, providerId, Map.of("check", checkType, "outcome", outcome));
		return saved;
	}

	/** The latest check of each required kind (null when never checked). */
	@Transactional(readOnly = true)
	public Map<String, ProviderVerification> current(String providerType, UUID providerId) {
		List<ProviderVerification> all = verifications.findByProviderIdOrderByCheckedAtDesc(providerId);
		Map<String, ProviderVerification> latest = new LinkedHashMap<>();
		for (String check : REQUIRED.get(providerType).keySet()) {
			latest.put(check, all.stream().filter(v -> v.getCheckType().equals(check)).findFirst().orElse(null));
		}
		return latest;
	}

	/** Seed data and dev stand-ins only: passing checks, as if MTA had looked the provider up. */
	@Transactional
	public void recordDemoChecks(String providerType, UUID providerId) {
		for (String check : REQUIRED.get(providerType).keySet()) {
			record(null, providerType, providerId, check, ProviderVerification.VERIFIED,
					LocalDate.now(ZONE).plusYears(1), "Demo data");
		}
	}

	@Transactional(readOnly = true)
	public List<ProviderVerification> history(UUID providerId) {
		return verifications.findByProviderIdOrderByCheckedAtDesc(providerId);
	}

	/** Approval needs every required check passing (verified, not expired). */
	@Transactional(readOnly = true)
	public void requirePassing(String providerType, UUID providerId) {
		LocalDate today = LocalDate.now(ZONE);
		current(providerType, providerId).forEach((check, v) -> {
			if (v == null || !v.passes(today)) {
				throw ApiException.conflict("verification_required", "Record a passing "
						+ REQUIRED.get(providerType).get(check) + " check before approving.");
			}
		});
	}

	private static Map<String, String> label(String key, String value) {
		Map<String, String> m = new LinkedHashMap<>();
		m.put(key, value);
		return m;
	}

	private static Map<String, String> labels() {
		Map<String, String> m = new LinkedHashMap<>();
		m.put(ProviderVerification.ACCREDITATION, "NSQHS accreditation");
		m.put(ProviderVerification.LICENCE, "State private hospital licence");
		return m;
	}

}
