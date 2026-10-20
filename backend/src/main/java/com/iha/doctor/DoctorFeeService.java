package com.iha.doctor;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import com.iha.audit.AuditService;
import com.iha.auth.CurrentUser;
import com.iha.common.ApiException;
import com.iha.notification.NotificationService;
import com.iha.payment.InvoiceRenderer;
import com.iha.payment.PaymentGateway;
import com.iha.payment.UnmatchedIntentEvent;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorRepository;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * Doctor platform fees (ported from {@code create_doctor_fee_payment}, the
 * {@code /api/fees/*} routes and their webhook). Registration fee: once, after
 * approval, unlocks the portal and starts the yearly cycle. Annual fee: due a
 * year after each payment. Completion runs from the shared payment webhook.
 */
@Service
public class DoctorFeeService {

	static final ZoneId BILLING_ZONE = ZoneId.of("Australia/Brisbane");

	private final DoctorAccountService accounts;
	private final DoctorRepository doctors;
	private final DoctorFeePaymentRepository payments;
	private final PlatformFeeSettingRepository settings;
	private final PaymentGateway gateway;
	private final InvoiceRenderer invoices;
	private final NotificationService notifications;
	private final AuditService audit;

	DoctorFeeService(DoctorAccountService accounts, DoctorRepository doctors, DoctorFeePaymentRepository payments,
			PlatformFeeSettingRepository settings, PaymentGateway gateway, InvoiceRenderer invoices,
			NotificationService notifications, AuditService audit) {
		this.accounts = accounts;
		this.doctors = doctors;
		this.payments = payments;
		this.settings = settings;
		this.gateway = gateway;
		this.invoices = invoices;
		this.notifications = notifications;
		this.audit = audit;
	}

	@Transactional(readOnly = true)
	public Fees fees() {
		return new Fees(amount(PlatformFeeSetting.DOCTOR_REGISTRATION_FEE), amount(PlatformFeeSetting.DOCTOR_ANNUAL_FEE));
	}

	@Transactional(readOnly = true)
	public Billing billing(CurrentUser user) {
		Doctor doctor = accounts.requireCurrent(user);
		Instant due = doctor.getAnnualFeeNextDueAt();
		return new Billing(fees(), doctor.getRegistrationFeePaidAt(), due,
				doctor.getRegistrationFeePaidAt() != null && due != null && !due.isAfter(Instant.now()),
				payments.findByDoctorIdOrderByCreatedAtDesc(doctor.getId()), gateway.name(), gateway.publishableKey());
	}

	@Transactional
	public Checkout checkout(CurrentUser user, String feeType) {
		Doctor doctor = accounts.requireCurrent(user);
		DoctorFeePayment payment;
		if (DoctorFeePayment.REGISTRATION.equals(feeType)) {
			if (!doctor.isApproved()) {
				throw ApiException.conflict("not_approved", "Your registration hasn't been approved yet.");
			}
			if (doctor.getRegistrationFeePaidAt() != null) {
				throw ApiException.conflict("already_paid", "The registration fee has already been paid.");
			}
			payment = payments.lockPending(doctor.getId(), feeType, null)
				.orElseGet(() -> payments.save(new DoctorFeePayment(doctor.getId(), feeType,
						amount(PlatformFeeSetting.DOCTOR_REGISTRATION_FEE), null, gateway.name())));
		}
		else if (DoctorFeePayment.ANNUAL.equals(feeType)) {
			if (doctor.getRegistrationFeePaidAt() == null) {
				throw ApiException.conflict("registration_fee_not_paid", "Pay the registration fee first.");
			}
			Instant due = doctor.getAnnualFeeNextDueAt();
			if (due == null || due.isAfter(Instant.now())) {
				throw ApiException.conflict("not_due_yet", "Your annual renewal isn't due yet.");
			}
			String period = due.atZone(BILLING_ZONE).toLocalDate().toString();
			payment = payments.lockPending(doctor.getId(), feeType, period)
				.orElseGet(() -> payments.save(new DoctorFeePayment(doctor.getId(), feeType,
						amount(PlatformFeeSetting.DOCTOR_ANNUAL_FEE), period, gateway.name())));
		}
		else {
			throw ApiException.badRequest("invalid_fee_type", "feeType must be \"registration\" or \"annual\".");
		}
		PaymentGateway.Intent intent = gateway.createOrReuseIntent(payment.getPaymentIntentId(),
				payment.getAmountAud().movePointRight(2).setScale(0, RoundingMode.HALF_UP).longValueExact(), null, null,
				Map.of("doctor_id", doctor.getId().toString(), "fee_type", feeType, "doctor_fee_payment_id",
						payment.getId().toString()),
				"MTA doctor " + feeType + " fee");
		if (!intent.id().equals(payment.getPaymentIntentId())) {
			payment.attachIntent(intent.id());
			audit.record(user.id(), user.email(), "doctor", "fee.intent_created", "doctor_fee_payment", payment.getId(),
					Map.of("fee_type", feeType, "amount", payment.getAmountAud().toPlainString()));
		}
		return new Checkout(gateway.name(), gateway.publishableKey(), payment.getId(), intent.id(),
				intent.clientSecret(), payment.getAmountAud(), feeType);
	}

	/** The simulated provider's "Pay Now" button. Only the payment's owner may trigger it. */
	@Transactional
	public void simulate(CurrentUser user, String intentId) {
		if (!gateway.simulated()) {
			throw ApiException.notFound("Not found.");
		}
		Doctor doctor = accounts.requireCurrent(user);
		DoctorFeePayment payment = payments.findByPaymentIntentId(intentId)
			.filter(p -> p.getDoctorId().equals(doctor.getId()))
			.orElseThrow(() -> ApiException.notFound("Payment not found."));
		complete(payment, "SIM-" + payment.getId().toString().substring(0, 8).toUpperCase());
	}

	/** Webhook callbacks for intents the patient payments don't know about. */
	@EventListener
	void onUnmatchedIntent(UnmatchedIntentEvent event) {
		payments.findByPaymentIntentId(event.intentId()).filter(DoctorFeePayment::isPending).ifPresent(payment -> {
			if (event.succeeded()) {
				complete(payment, event.chargeReference() != null ? event.chargeReference() : event.intentId());
			}
			else {
				payment.fail();
			}
		});
	}

	private void complete(DoctorFeePayment payment, String reference) {
		if (!payment.isPending()) {
			return;
		}
		payment.complete(reference);
		Doctor doctor = doctors.findById(payment.getDoctorId()).orElseThrow();
		boolean registration = DoctorFeePayment.REGISTRATION.equals(payment.getFeeType());
		if (registration) {
			doctor.markRegistrationFeePaid(payment.getPaidAt(), plusYear(payment.getPaidAt()));
		}
		else {
			Instant current = doctor.getAnnualFeeNextDueAt();
			doctor.markAnnualFeePaid(plusYear(current != null ? current : payment.getPaidAt()));
		}
		if (doctor.getUserId() != null) {
			notifications.notify(doctor.getUserId(), registration ? "registration_fee_paid" : "annual_fee_paid",
					registration ? "Registration fee paid" : "Annual fee paid",
					registration
							? "Your registration fee has been received. Welcome to MTA — your dashboard is now unlocked."
							: "Your annual renewal fee has been received. Thank you.",
					null);
		}
		audit.record(null, null, "doctor", "fee.payment_completed", "doctor_fee_payment", payment.getId(),
				Map.of("doctor_id", doctor.getId().toString(), "fee_type", payment.getFeeType(), "amount",
						payment.getAmountAud().toPlainString()));
	}

	@Transactional(readOnly = true)
	public Invoice invoice(CurrentUser user, UUID paymentId) {
		Doctor doctor = accounts.requireCurrent(user);
		DoctorFeePayment payment = payments.findByIdAndDoctorId(paymentId, doctor.getId())
			.filter(p -> DoctorFeePayment.COMPLETED.equals(p.getStatus()))
			.orElseThrow(() -> ApiException.notFound("Invoice not found."));
		String label = DoctorFeePayment.REGISTRATION.equals(payment.getFeeType()) ? "Doctor registration fee"
				: "Doctor annual renewal fee";
		String number = "MTA-DR-" + payment.getId().toString().substring(0, 8).toUpperCase();
		byte[] pdf = invoices.render(new InvoiceRenderer.Invoice(number, payment.getPaidAt(), "Fee", label,
				payment.getGatewayReference(), doctor.getFullName(), user.email(), null,
				List.of(new InvoiceRenderer.Line(label, payment.getAmountAud())), payment.getAmountAud()));
		audit.record(user.id(), user.email(), "doctor", "fee.invoice_downloaded", "doctor_fee_payment", paymentId,
				Map.of());
		return new Invoice(number + ".pdf", pdf);
	}

	private BigDecimal amount(String key) {
		return settings.findByFeeKey(key)
			.map(PlatformFeeSetting::getAmountAud)
			.orElseThrow(() -> ApiException.conflict("fee_not_configured", "This fee hasn't been configured."));
	}

	private static Instant plusYear(Instant from) {
		return ZonedDateTime.ofInstant(from, BILLING_ZONE).plusYears(1).toInstant();
	}

	public record Fees(BigDecimal registrationFeeAud, BigDecimal annualFeeAud) {
	}

	public record Billing(Fees fees, Instant registrationFeePaidAt, Instant annualFeeNextDueAt, boolean annualFeeDue,
			List<DoctorFeePayment> payments, String provider, String publishableKey) {
	}

	public record Checkout(String provider, String publishableKey, UUID paymentId, String intentId,
			String clientSecret, BigDecimal amountAud, String feeType) {
	}

	public record Invoice(String fileName, byte[] content) {
	}

}
