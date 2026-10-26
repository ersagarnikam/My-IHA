package com.iha.fees;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.common.Abn;
import com.iha.common.ApiException;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * MTA's own business details for invoices, and how GST applies. Until MTA is
 * registered for GST (and has an ABN), documents are plain invoices with no GST.
 * Once registered they become tax invoices: Australian prices include GST, so a
 * taxable charge contains 1/11 GST; medical treatment and consultations are
 * GST-free by default. MTA's accountant should confirm the classification.
 */
@Service
public class BusinessSettingsService {

	/** The kinds of charge MTA invoices, each taxable or GST-free. */
	public enum Charge {
		MTA_SERVICE_FEE("gst_mta_service_fee", "MTA service fee on treatment plans"),
		DOCTOR_FEES("gst_doctor_fees", "Doctor registration and annual membership fees"),
		CONSULTATION_FEE("gst_consultation_fee", "Online consultation fee"),
		TREATMENT_COSTS("gst_treatment_costs", "Treatment costs (doctor, hospital and other medical items)");

		final String key;

		final String label;

		Charge(String key, String label) {
			this.key = key;
			this.label = label;
		}

	}

	private final BusinessSettingRepository settings;
	private final AuditService audit;

	BusinessSettingsService(BusinessSettingRepository settings, AuditService audit) {
		this.settings = settings;
		this.audit = audit;
	}

	@Transactional(readOnly = true)
	public Business current() {
		Map<String, BusinessSetting> byKey = settings.findAll().stream()
			.collect(Collectors.toMap(BusinessSetting::getKey, Function.identity()));
		Map<Charge, Boolean> taxable = new LinkedHashMap<>();
		for (Charge c : Charge.values()) {
			taxable.put(c, "true".equals(value(byKey, c.key)));
		}
		BusinessSetting last = byKey.values().stream()
			.filter(s -> s.getUpdatedBy() != null)
			.max(Comparator.comparing(BusinessSetting::getUpdatedAt))
			.orElse(null);
		return new Business(value(byKey, "legal_name"), value(byKey, "abn"), value(byKey, "address"),
				value(byKey, "email"), "true".equals(value(byKey, "gst_registered")), taxable,
				last == null ? null : last.getUpdatedAt(), last == null ? null : last.getUpdatedBy());
	}

	@Transactional
	public Business update(CurrentUser actor, Business input) {
		if (input.legalName() == null || input.legalName().isBlank()) {
			throw ApiException.badRequest("legal_name_required", "Enter MTA's legal or business name.");
		}
		String abn = Abn.normalize(input.abn());
		if (!abn.isEmpty() && !Abn.isValid(abn)) {
			throw ApiException.badRequest("invalid_abn", "Enter a valid ABN (11 digits).");
		}
		if (input.gstRegistered() && abn.isEmpty()) {
			throw ApiException.badRequest("abn_required", "A GST-registered business needs its ABN on tax invoices.");
		}
		set(actor, "legal_name", input.legalName().trim());
		set(actor, "abn", abn);
		set(actor, "address", trim(input.address()));
		set(actor, "email", trim(input.email()));
		set(actor, "gst_registered", String.valueOf(input.gstRegistered()));
		if (input.taxable() != null) {
			input.taxable().forEach((charge, value) -> set(actor, charge.key, String.valueOf(Boolean.TRUE.equals(value))));
		}
		audit.record(actor.id(), actor.email(), "admin", "business_settings.changed", "business_settings", null,
				Map.of("gst_registered", String.valueOf(input.gstRegistered())));
		return current();
	}

	/** Privacy policy and terms links, consent version and record retention (for MTA's lawyer to confirm). */
	@Transactional(readOnly = true)
	public Privacy privacy() {
		Map<String, BusinessSetting> byKey = settings.findAll().stream()
			.collect(Collectors.toMap(BusinessSetting::getKey, Function.identity()));
		int years;
		try {
			years = Integer.parseInt(value(byKey, "retention_years"));
		}
		catch (NumberFormatException e) {
			years = Privacy.DEFAULT_RETENTION_YEARS;
		}
		return new Privacy(value(byKey, "privacy_policy_url"), value(byKey, "terms_url"),
				value(byKey, "consent_version"), years);
	}

	@Transactional
	public Privacy updatePrivacy(CurrentUser actor, Privacy input) {
		String policy = trim(input.privacyPolicyUrl());
		String terms = trim(input.termsUrl());
		if (!policy.startsWith("https://") || !terms.startsWith("https://")) {
			throw ApiException.badRequest("invalid_url", "Links must start with https://.");
		}
		String version = trim(input.consentVersion());
		if (version.isEmpty() || version.length() > 40) {
			throw ApiException.badRequest("invalid_consent_version", "Enter a consent version (e.g. 2026-10).");
		}
		if (input.retentionYears() < 1 || input.retentionYears() > 50) {
			throw ApiException.badRequest("invalid_retention_years", "Keep records for 1 to 50 years.");
		}
		Privacy before = privacy();
		set(actor, "privacy_policy_url", policy);
		set(actor, "terms_url", terms);
		set(actor, "consent_version", version);
		set(actor, "retention_years", String.valueOf(input.retentionYears()));
		audit.record(actor.id(), actor.email(), "admin", "privacy_settings.changed", "business_settings", null,
				Map.of("consent_version", version, "previous_consent_version", before.consentVersion(),
						"retention_years", String.valueOf(input.retentionYears())));
		return privacy();
	}

	/** GST contained in a GST-inclusive amount of a taxable charge, or null when none applies. */
	@Transactional(readOnly = true)
	public BigDecimal gstIn(Charge charge, BigDecimal amount) {
		Business b = current();
		return b.chargesGst() && Boolean.TRUE.equals(b.taxable().get(charge)) ? gstOf(amount) : null;
	}

	public static BigDecimal gstOf(BigDecimal inclusiveAmount) {
		return inclusiveAmount.divide(BigDecimal.valueOf(11), 2, RoundingMode.HALF_UP);
	}

	public static String label(Charge charge) {
		return charge.label;
	}

	private void set(CurrentUser actor, String key, String value) {
		BusinessSetting s = settings.findById(key).orElseGet(() -> settings.save(new BusinessSetting(key, null)));
		String old = s.getValue() == null ? "" : s.getValue();
		if (!old.equals(value == null ? "" : value)) {
			s.change(value, actor.email());
		}
	}

	private static String value(Map<String, BusinessSetting> byKey, String key) {
		BusinessSetting s = byKey.get(key);
		return s == null || s.getValue() == null ? "" : s.getValue();
	}

	private static String trim(String value) {
		return value == null ? "" : value.trim();
	}

	/**
	 * @param consentVersion recorded with every consent; change it when the
	 * wording or the policy changes materially
	 * @param retentionYears how long a closed patient account's health and
	 * payment records are kept before they are purged
	 */
	public record Privacy(String privacyPolicyUrl, String termsUrl, String consentVersion, int retentionYears) {

		public static final int DEFAULT_RETENTION_YEARS = 7;

	}

	/**
	 * @param taxable whether each charge carries GST (used only when {@code gstRegistered})
	 */
	public record Business(String legalName, String abn, String address, String email, boolean gstRegistered,
			Map<Charge, Boolean> taxable, Instant updatedAt, String updatedBy) {

		/** Tax invoices need both the registration and the ABN. */
		public boolean chargesGst() {
			return gstRegistered && abn != null && !abn.isBlank();
		}

	}

}
