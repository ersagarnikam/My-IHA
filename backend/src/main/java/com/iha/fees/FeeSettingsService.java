package com.iha.fees;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.common.ApiException;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Platform fees that MTA admin can change. Every module reads its fee here at
 * the moment it creates a charge, so a change applies to new payments only:
 * a payment already started keeps its amount.
 */
@Service
public class FeeSettingsService {

	public static final String DOCTOR_REGISTRATION_FEE = "doctor_registration_fee";
	public static final String DOCTOR_ANNUAL_FEE = "doctor_annual_fee";
	public static final String LAWYER_REGISTRATION_FEE = "lawyer_registration_fee";
	public static final String LAWYER_ANNUAL_FEE = "lawyer_annual_fee";
	public static final String HOSPITAL_REGISTRATION_FEE = "hospital_registration_fee";
	public static final String HOSPITAL_ANNUAL_FEE = "hospital_annual_fee";
	public static final String CONSULTATION_FEE = "consultation_fee";
	public static final String MTA_SERVICE_FEE_PCT = "mta_service_fee_pct";
	public static final String CARD_FEE_PCT = "card_fee_pct";
	public static final String CARD_FEE_FIXED_AUD = "card_fee_fixed_aud";

	static final BigDecimal MAX_AUD = new BigDecimal("1000000");
	static final BigDecimal MAX_PCT = new BigDecimal("100");

	/**
	 * The catalogue, in display order. {@code charged}: false for fees whose portal
	 * doesn't exist yet (stored now, charged once the portal launches).
	 */
	static final Map<String, Definition> CATALOGUE = new LinkedHashMap<>();

	static {
		define(DOCTOR_REGISTRATION_FEE, "doctors", "Registration (onboarding) fee",
				"Paid once after MTA approves a doctor; unlocks case invitations.", Unit.AUD, true);
		define(DOCTOR_ANNUAL_FEE, "doctors", "Annual membership fee",
				"Due a year after registration and every year after that.", Unit.AUD, true);
		define(LAWYER_REGISTRATION_FEE, "lawyers", "Registration (onboarding) fee",
				"Paid once after MTA approves a visa lawyer.", Unit.AUD, false);
		define(LAWYER_ANNUAL_FEE, "lawyers", "Annual membership fee", "Due every year after registration.", Unit.AUD,
				false);
		define(HOSPITAL_REGISTRATION_FEE, "hospitals", "Registration (onboarding) fee",
				"Paid once when a hospital joins the platform.", Unit.AUD, false);
		define(HOSPITAL_ANNUAL_FEE, "hospitals", "Annual membership fee", "Due every year after registration.", Unit.AUD,
				false);
		define(CONSULTATION_FEE, "patients", "Online consultation fee",
				"What a patient pays to book a Zoom consultation with a doctor (initial or follow-up).", Unit.AUD, true);
		define(MTA_SERVICE_FEE_PCT, "patients", "Suggested MTA service fee",
				"Percentage of the plan total suggested when publishing a treatment plan; admin can change it per plan.",
				Unit.PERCENT, true);
		define(CARD_FEE_PCT, "refunds", "Card processing fee (percentage)",
				"Deducted from refunds when the payment provider can't report the real fee (e.g. the simulated provider). "
						+ "With Stripe the actual fee on the payment is used.",
				Unit.PERCENT, true, false);
		define(CARD_FEE_FIXED_AUD, "refunds", "Card processing fee (fixed per payment)",
				"Added to the percentage above for the same estimate.", Unit.AUD, true, false);
	}

	private final PlatformFeeSettingRepository settings;
	private final PlatformFeeChangeRepository changes;
	private final AuditService audit;

	FeeSettingsService(PlatformFeeSettingRepository settings, PlatformFeeChangeRepository changes, AuditService audit) {
		this.settings = settings;
		this.changes = changes;
		this.audit = audit;
	}

	/** The current value of a fee (AUD, or percent for {@link #MTA_SERVICE_FEE_PCT}). */
	@Transactional(readOnly = true)
	public BigDecimal amount(String key) {
		return settings.findByFeeKey(key)
			.map(PlatformFeeSetting::getAmountAud)
			.orElseThrow(() -> ApiException.conflict("fee_not_configured", "This fee hasn't been configured."));
	}

	public BigDecimal consultationFeeAud() {
		return amount(CONSULTATION_FEE);
	}

	/** The suggested MTA service fee as a rate (10% → 0.10). */
	public BigDecimal serviceFeeRate() {
		return amount(MTA_SERVICE_FEE_PCT).divide(MAX_PCT, 4, RoundingMode.HALF_UP);
	}

	@Transactional(readOnly = true)
	public List<FeeView> all() {
		Map<String, PlatformFeeSetting> byKey = new LinkedHashMap<>();
		settings.findAll().forEach(s -> byKey.put(s.getFeeKey(), s));
		return CATALOGUE.values().stream()
			.map(d -> Optional.ofNullable(byKey.get(d.key())).map(s -> view(d, s)).orElse(null))
			.filter(v -> v != null)
			.toList();
	}

	@Transactional(readOnly = true)
	public List<PlatformFeeChange> history() {
		return changes.findTop50ByOrderByChangedAtDesc();
	}

	@Transactional
	public FeeView update(CurrentUser actor, String key, BigDecimal amount, String reason) {
		Definition definition = CATALOGUE.get(key);
		PlatformFeeSetting setting = definition == null ? null : settings.findByFeeKey(key).orElse(null);
		if (setting == null) {
			throw ApiException.notFound("Fee not found.");
		}
		if (amount == null || amount.signum() < 0 || amount.stripTrailingZeros().scale() > 2) {
			throw ApiException.badRequest("invalid_amount", "Enter an amount of 0 or more, with at most 2 decimals.");
		}
		BigDecimal max = definition.unit() == Unit.PERCENT ? MAX_PCT : MAX_AUD;
		if (amount.compareTo(max) > 0) {
			throw ApiException.badRequest("invalid_amount", definition.unit() == Unit.PERCENT
					? "A percentage can't be more than 100." : "That amount is too large.");
		}
		// A charged AUD fee of 0 would create zero-value card payments.
		if (definition.mustBePositive() && amount.signum() == 0) {
			throw ApiException.badRequest("invalid_amount", "This fee is charged by card, so it must be more than 0.");
		}
		BigDecimal newAmount = amount.setScale(2, RoundingMode.HALF_UP);
		BigDecimal old = setting.getAmountAud();
		if (old.compareTo(newAmount) == 0) {
			return view(definition, setting);
		}
		String cleanReason = reason == null || reason.isBlank() ? null : reason.trim();
		setting.change(newAmount, actor.email());
		changes.save(new PlatformFeeChange(key, old, newAmount, cleanReason, actor.email()));
		audit.record(actor.id(), actor.email(), "admin", "fee.changed", "platform_fee_setting", key,
				Map.of("fee", key, "from", old.toPlainString(), "to", newAmount.toPlainString()));
		return view(definition, setting);
	}

	private static FeeView view(Definition d, PlatformFeeSetting s) {
		return new FeeView(d.key(), d.group(), d.label(), d.description(), d.unit().name().toLowerCase(), d.charged(),
				s.getAmountAud(), s.getUpdatedAt(), s.getUpdatedBy());
	}

	private static void define(String key, String group, String label, String description, Unit unit, boolean charged) {
		define(key, group, label, description, unit, charged, charged && unit == Unit.AUD);
	}

	private static void define(String key, String group, String label, String description, Unit unit, boolean charged,
			boolean mustBePositive) {
		CATALOGUE.put(key, new Definition(key, group, label, description, unit, charged, mustBePositive));
	}

	enum Unit {
		AUD, PERCENT
	}

	/** {@code mustBePositive}: fees charged by card can't be 0 (zero-value card payments). */
	record Definition(String key, String group, String label, String description, Unit unit, boolean charged,
			boolean mustBePositive) {
	}

	/** {@code unit}: aud or percent. {@code charged}: false while the fee's portal doesn't exist yet. */
	public record FeeView(String key, String group, String label, String description, String unit, boolean charged,
			BigDecimal amount, Instant updatedAt, String updatedBy) {
	}

}
