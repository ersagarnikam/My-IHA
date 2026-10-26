package com.iha.privacy;

import java.util.List;
import java.util.UUID;

import com.iha.common.ApiException;
import com.iha.fees.BusinessSettingsService;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Consent collected at sign-up (Australian Privacy Principles 3, 5 and 8:
 * health information is sensitive and needs consent, and patients are told it
 * goes to doctors, hospitals and visa lawyers, some possibly outside
 * Australia). Each consent is stored with the current
 * {@code consent_version}. Wording and scope are for MTA's lawyer to confirm.
 */
@Service
public class ConsentService {

	private final ConsentRepository consents;
	private final BusinessSettingsService settings;

	ConsentService(ConsentRepository consents, BusinessSettingsService settings) {
		this.consents = consents;
		this.settings = settings;
	}

	/** Checks the sign-up form before the account is created. */
	public static void require(Boolean acceptTerms, Boolean consentHealthInfo, boolean patient) {
		if (!Boolean.TRUE.equals(acceptTerms)) {
			throw ApiException.badRequest("consent_required", "Please accept the terms of use and privacy policy.");
		}
		if (patient && !Boolean.TRUE.equals(consentHealthInfo)) {
			throw ApiException.badRequest("consent_required",
					"Please agree to MTA collecting and sharing your health information to arrange your treatment.");
		}
	}

	@Transactional
	public void record(UUID userId, String... kinds) {
		String version = settings.privacy().consentVersion();
		for (String kind : kinds) {
			consents.save(new Consent(userId, kind, version));
		}
	}

	@Transactional(readOnly = true)
	public List<Consent> history(UUID userId) {
		return consents.findByUserIdOrderByAcceptedAtDesc(userId);
	}

}
