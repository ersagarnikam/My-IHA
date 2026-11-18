package com.iha.providerfee;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.common.ApiException;
import com.iha.fees.BusinessSettingsService;
import com.iha.fees.FeeSettingsService;
import com.iha.notification.NotificationService;
import com.iha.payment.InvoiceRenderer;
import com.iha.payment.PaymentGateway;
import com.iha.payment.UnmatchedIntentEvent;
import com.iha.provider.FeePayingProvider;
import com.iha.provider.HospitalRepository;
import com.iha.provider.LawyerRepository;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Hospital and visa lawyer platform fees, like doctors' ({@code DoctorFeeService}).
 * Registration fee: once, after approval; until it is paid the portal stays
 * locked (see {@link #requireSettled}). Annual fee: due a year after
 * registration and each renewal; an overdue renewal is only a reminder, never a
 * lock. A fee set to 0 in admin Settings isn't charged: approving with a 0
 * registration fee records it as waived. Completion runs from the shared payment
 * webhook ({@link UnmatchedIntentEvent}).
 */
@Service
public class ProviderFeeService {

	static final ZoneId BILLING_ZONE = ZoneId.of("Australia/Brisbane");

	private final ProviderFeePaymentRepository payments;
	private final HospitalRepository hospitals;
	private final LawyerRepository lawyers;
	private final FeeSettingsService fees;
	private final BusinessSettingsService business;
	private final PaymentGateway gateway;
	private final InvoiceRenderer invoices;
	private final NotificationService notifications;
	private final AuditService audit;

	ProviderFeeService(ProviderFeePaymentRepository payments, HospitalRepository hospitals, LawyerRepository lawyers,
			FeeSettingsService fees, BusinessSettingsService business, PaymentGateway gateway, InvoiceRenderer invoices,
			NotificationService notifications, AuditService audit) {
		this.payments = payments;
		this.hospitals = hospitals;
		this.lawyers = lawyers;
		this.fees = fees;
		this.business = business;
		this.gateway = gateway;
		this.invoices = invoices;
		this.notifications = notifications;
		this.audit = audit;
	}

	// ── Status ──────────────────────────────────────────────────────────────

	@Transactional(readOnly = true)
	public Fees fees(String providerType) {
		return new Fees(fees.amount(registrationKey(providerType)), fees.amount(annualKey(providerType)));
	}

	/** Approved, but the registration fee (above 0) hasn't been paid: the portal stays locked. */
	@Transactional(readOnly = true)
	public boolean registrationFeeOwed(FeePayingProvider provider) {
		return provider.isApproved() && provider.getRegistrationFeePaidAt() == null
				&& fees.amount(registrationKey(provider.providerType())).signum() > 0;
	}

	/** The gate for everything past approval. */
	@Transactional(readOnly = true)
	public void requireSettled(FeePayingProvider provider) {
		if (registrationFeeOwed(provider)) {
			throw ApiException.forbidden("registration_fee_unpaid", "Pay the registration fee to unlock your account.");
		}
	}

	@Transactional(readOnly = true)
	public Membership membership(FeePayingProvider provider) {
		Fees f = fees(provider.providerType());
		Instant due = nextDue(provider);
		boolean annualDue = provider.getRegistrationFeePaidAt() != null && due != null && !due.isAfter(Instant.now())
				&& f.annualFeeAud().signum() > 0;
		return new Membership(f.registrationFeeAud(), f.annualFeeAud(), registrationFeeOwed(provider),
				provider.getRegistrationFeePaidAt(), provider.isRegistrationFeeWaived(), due, annualDue);
	}

	@Transactional(readOnly = true)
	public Billing billing(FeePayingProvider provider) {
		return new Billing(membership(provider),
				payments.findByProviderTypeAndProviderIdOrderByCreatedAtDesc(provider.providerType(), provider.getId()),
				gateway.name(), gateway.publishableKey());
	}

	/** MTA approved the account: with a 0 registration fee nothing is charged and the yearly cycle starts now. */
	@Transactional
	public void onApproved(FeePayingProvider provider) {
		if (provider.getRegistrationFeePaidAt() == null
				&& fees.amount(registrationKey(provider.providerType())).signum() <= 0) {
			Instant now = Instant.now();
			provider.markRegistrationFeeWaived(now, plusYear(now));
		}
	}

	// ── Paying ──────────────────────────────────────────────────────────────

	@Transactional
	public Checkout checkout(CurrentUser user, FeePayingProvider provider, String feeType) {
		String type = provider.providerType();
		ProviderFeePayment payment;
		if (ProviderFeePayment.REGISTRATION.equals(feeType)) {
			if (!provider.isApproved()) {
				throw ApiException.conflict("not_approved", "Your registration hasn't been approved yet.");
			}
			if (provider.getRegistrationFeePaidAt() != null) {
				throw ApiException.conflict("already_paid", "The registration fee has already been settled.");
			}
			BigDecimal amount = fees.amount(registrationKey(type));
			if (amount.signum() <= 0) {
				throw ApiException.conflict("no_fee", "No registration fee applies at the moment.");
			}
			payment = payments.lockPending(type, provider.getId(), feeType, null)
				.filter(p -> p.getAmountAud().compareTo(amount) == 0)
				.orElseGet(() -> payments
					.save(new ProviderFeePayment(type, provider.getId(), feeType, amount, null, gateway.name())));
		}
		else if (ProviderFeePayment.ANNUAL.equals(feeType)) {
			Membership m = membership(provider);
			if (provider.getRegistrationFeePaidAt() == null) {
				throw ApiException.conflict("registration_fee_not_paid", "Pay the registration fee first.");
			}
			if (!m.annualFeeDue()) {
				throw ApiException.conflict("not_due_yet", "Your annual renewal isn't due yet.");
			}
			String period = m.annualFeeNextDueAt().atZone(BILLING_ZONE).toLocalDate().toString();
			BigDecimal amount = m.annualFeeAud();
			payment = payments.lockPending(type, provider.getId(), feeType, period)
				.filter(p -> p.getAmountAud().compareTo(amount) == 0)
				.orElseGet(() -> payments
					.save(new ProviderFeePayment(type, provider.getId(), feeType, amount, period, gateway.name())));
		}
		else {
			throw ApiException.badRequest("invalid_fee_type", "feeType must be \"registration\" or \"annual\".");
		}
		PaymentGateway.Intent intent = gateway.createOrReuseIntent(payment.getPaymentIntentId(),
				payment.getAmountAud().movePointRight(2).setScale(0, RoundingMode.HALF_UP).longValueExact(), null, null,
				Map.of("provider_type", type, "provider_id", provider.getId().toString(), "fee_type", feeType,
						"provider_fee_payment_id", payment.getId().toString()),
				"MTA " + label(type) + " " + feeType + " fee");
		if (!intent.id().equals(payment.getPaymentIntentId())) {
			payment.attachIntent(intent.id());
			audit.record(user.id(), user.email(), type, "fee.intent_created", "provider_fee_payment", payment.getId(),
					Map.of("fee_type", feeType, "amount", payment.getAmountAud().toPlainString()));
		}
		return new Checkout(gateway.name(), gateway.publishableKey(), payment.getId(), intent.id(),
				intent.clientSecret(), payment.getAmountAud(), feeType);
	}

	/** The simulated provider's "Pay Now" button. Only the payment's owner may trigger it. */
	@Transactional
	public void simulate(FeePayingProvider provider, String intentId) {
		if (!gateway.simulated()) {
			throw ApiException.notFound("Not found.");
		}
		ProviderFeePayment payment = payments.findByPaymentIntentId(intentId)
			.filter(p -> p.getProviderType().equals(provider.providerType())
					&& p.getProviderId().equals(provider.getId()))
			.orElseThrow(() -> ApiException.notFound("Payment not found."));
		complete(payment, "SIM-" + payment.getId().toString().substring(0, 8).toUpperCase());
	}

	/** Webhook callbacks for intents the patient payments don't know about. */
	@EventListener
	void onUnmatchedIntent(UnmatchedIntentEvent event) {
		payments.findByPaymentIntentId(event.intentId()).filter(ProviderFeePayment::isPending).ifPresent(payment -> {
			if (event.succeeded()) {
				complete(payment, event.chargeReference() != null ? event.chargeReference() : event.intentId());
			}
			else {
				payment.fail();
			}
		});
	}

	private void complete(ProviderFeePayment payment, String reference) {
		if (!payment.isPending()) {
			return;
		}
		payment.complete(reference);
		FeePayingProvider provider = provider(payment.getProviderType(), payment.getProviderId()).orElseThrow();
		boolean registration = ProviderFeePayment.REGISTRATION.equals(payment.getFeeType());
		if (registration) {
			provider.markRegistrationFeePaid(payment.getPaidAt(), plusYear(payment.getPaidAt()));
		}
		else {
			Instant current = nextDue(provider);
			provider.markAnnualFeePaid(plusYear(current != null ? current : payment.getPaidAt()));
		}
		if (provider.getUserId() != null) {
			notifications.notify(provider.getUserId(), registration ? "registration_fee_paid" : "annual_fee_paid",
					registration ? "Registration fee paid" : "Annual fee paid",
					registration ? "Your registration fee has been received. Welcome to MTA — your portal is now unlocked."
							: "Your annual renewal fee has been received. Thank you.",
					null);
		}
		audit.record(null, null, payment.getProviderType(), "fee.payment_completed", "provider_fee_payment",
				payment.getId(), Map.of("provider_id", provider.getId().toString(), "fee_type", payment.getFeeType(),
						"amount", payment.getAmountAud().toPlainString()));
	}

	// ── Invoices ────────────────────────────────────────────────────────────

	@Transactional(readOnly = true)
	public Invoice invoice(CurrentUser user, FeePayingProvider provider, UUID paymentId) {
		ProviderFeePayment payment = payments
			.findByIdAndProviderTypeAndProviderId(paymentId, provider.providerType(), provider.getId())
			.filter(p -> p.getPaidAt() != null)
			.orElseThrow(() -> ApiException.notFound("Invoice not found."));
		boolean hospital = FeePayingProvider.HOSPITAL.equals(provider.providerType());
		String label = (hospital ? "Hospital" : "Visa lawyer")
				+ (ProviderFeePayment.REGISTRATION.equals(payment.getFeeType()) ? " registration fee"
						: " annual renewal fee");
		String prefix = hospital ? "MTA-HO-" : "MTA-VL-";
		String number = prefix + payment.getId().toString().substring(0, 8).toUpperCase();
		byte[] pdf = invoices.render(new InvoiceRenderer.Invoice(number, payment.getPaidAt(), "Fee", label,
				payment.getGatewayReference(), provider.getName(), user.email(), null,
				List.of(new InvoiceRenderer.Line(label, payment.getAmountAud(),
						business.gstIn(BusinessSettingsService.Charge.PROVIDER_FEES, payment.getAmountAud()))),
				payment.getAmountAud()));
		audit.record(user.id(), user.email(), provider.providerType(), "fee.invoice_downloaded", "provider_fee_payment",
				paymentId, Map.of());
		return new Invoice(number + ".pdf", pdf);
	}

	// ── Helpers ─────────────────────────────────────────────────────────────

	public Optional<FeePayingProvider> provider(String providerType, UUID id) {
		return switch (providerType) {
			case FeePayingProvider.HOSPITAL -> hospitals.findById(id).map(h -> (FeePayingProvider) h);
			case FeePayingProvider.LAWYER -> lawyers.findById(id).map(l -> (FeePayingProvider) l);
			default -> Optional.empty();
		};
	}

	/** Accounts settled before the cycle was recorded renew a year after registration. */
	private static Instant nextDue(FeePayingProvider provider) {
		if (provider.getAnnualFeeNextDueAt() != null) {
			return provider.getAnnualFeeNextDueAt();
		}
		return provider.getRegistrationFeePaidAt() == null ? null : plusYear(provider.getRegistrationFeePaidAt());
	}

	private static String label(String providerType) {
		return FeePayingProvider.HOSPITAL.equals(providerType) ? "hospital" : "visa lawyer";
	}

	private static String registrationKey(String providerType) {
		return FeePayingProvider.HOSPITAL.equals(providerType) ? FeeSettingsService.HOSPITAL_REGISTRATION_FEE
				: FeeSettingsService.LAWYER_REGISTRATION_FEE;
	}

	private static String annualKey(String providerType) {
		return FeePayingProvider.HOSPITAL.equals(providerType) ? FeeSettingsService.HOSPITAL_ANNUAL_FEE
				: FeeSettingsService.LAWYER_ANNUAL_FEE;
	}

	private static Instant plusYear(Instant from) {
		return ZonedDateTime.ofInstant(from, BILLING_ZONE).plusYears(1).toInstant();
	}

	public record Fees(BigDecimal registrationFeeAud, BigDecimal annualFeeAud) {
	}

	/**
	 * @param registrationFeeDue approved but the registration fee is unpaid: the portal is locked
	 * @param registrationFeeWaived the fee was 0 at approval, so nothing was charged
	 * @param annualFeeDue the renewal date has passed and an annual fee above 0 applies (a reminder only)
	 */
	public record Membership(BigDecimal registrationFeeAud, BigDecimal annualFeeAud, boolean registrationFeeDue,
			Instant registrationFeePaidAt, boolean registrationFeeWaived, Instant annualFeeNextDueAt,
			boolean annualFeeDue) {
	}

	public record Billing(Membership membership, List<ProviderFeePayment> payments, String provider,
			String publishableKey) {
	}

	public record Checkout(String provider, String publishableKey, UUID paymentId, String intentId,
			String clientSecret, BigDecimal amountAud, String feeType) {
	}

	public record Invoice(String fileName, byte[] content) {
	}

}
