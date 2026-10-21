package com.iha.admin;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.function.Function;
import java.util.stream.Collectors;

import com.iha.auth.CurrentUser;
import com.iha.cases.CaseRepository;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.doctor.DoctorFeePayment;
import com.iha.doctor.DoctorFeePaymentRepository;
import com.iha.patient.Patient;
import com.iha.patient.PatientRepository;
import com.iha.payment.Payment;
import com.iha.payment.PaymentRepository;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorRepository;
import com.iha.refund.PaymentRefund;
import com.iha.refund.RefundService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/**
 * MTA admin: every payment received (patient payments and doctor fees) and
 * refunds. {@code kind} is {@code patient} or {@code doctor}.
 */
@RestController
@RequestMapping("/api/admin/payments")
public class AdminPaymentController {

	private final PaymentRepository payments;
	private final DoctorFeePaymentRepository feePayments;
	private final PatientRepository patients;
	private final DoctorRepository doctors;
	private final CaseRepository cases;
	private final RefundService refunds;

	AdminPaymentController(PaymentRepository payments, DoctorFeePaymentRepository feePayments,
			PatientRepository patients, DoctorRepository doctors, CaseRepository cases, RefundService refunds) {
		this.payments = payments;
		this.feePayments = feePayments;
		this.patients = patients;
		this.doctors = doctors;
		this.cases = cases;
		this.refunds = refunds;
	}

	/** Paid payments, newest first; {@code caseId} narrows to one case. */
	@GetMapping
	@Transactional(readOnly = true)
	public List<PaymentRow> list(@RequestParam(required = false) UUID caseId) {
		List<Payment> patientPayments = (caseId == null ? payments.findAll()
				: payments.findByCaseIdInOrderByCreatedAtDesc(List.of(caseId)))
			.stream()
			.filter(p -> p.getPaidAt() != null)
			.toList();
		List<DoctorFeePayment> doctorPayments = caseId != null ? List.of()
				: feePayments.findAll().stream().filter(p -> p.getPaidAt() != null).toList();
		return rows(patientPayments, doctorPayments);
	}

	@GetMapping("/{kind}/{paymentId}")
	@Transactional(readOnly = true)
	public PaymentDetail detail(@PathVariable String kind, @PathVariable UUID paymentId) {
		PaymentRow row = row(kind, paymentId);
		return new PaymentDetail(row, refunds.quote(kind, paymentId),
				refunds.refundsFor(paymentId).stream().map(RefundRow::of).toList(), RefundService.REASONS);
	}

	@PostMapping("/{kind}/{paymentId}/refunds")
	@ResponseStatus(HttpStatus.CREATED)
	public PaymentDetail refund(@AuthenticationPrincipal Jwt jwt, @PathVariable String kind,
			@PathVariable UUID paymentId, @Valid @RequestBody RefundRequest request) {
		refunds.refund(CurrentUser.from(jwt), kind, paymentId, request.amountAud(), request.reason(), request.note(),
				Boolean.TRUE.equals(request.waiveFee()));
		return detail(kind, paymentId);
	}

	private PaymentRow row(String kind, UUID id) {
		List<PaymentRow> found = switch (kind) {
			case RefundService.PATIENT -> rows(payments.findById(id).stream().toList(), List.of());
			case RefundService.DOCTOR -> rows(List.of(), feePayments.findById(id).stream().toList());
			default -> List.of();
		};
		if (found.isEmpty()) {
			throw ApiException.notFound("Payment not found.");
		}
		return found.get(0);
	}

	private List<PaymentRow> rows(List<Payment> patientPayments, List<DoctorFeePayment> doctorPayments) {
		List<UUID> ids = new ArrayList<>();
		patientPayments.forEach(p -> ids.add(p.getId()));
		doctorPayments.forEach(p -> ids.add(p.getId()));
		Map<UUID, List<PaymentRefund>> refunded = refunds.refundsByPayment(ids);
		Map<UUID, Patient> patientById = byId(
				patients.findAllById(patientPayments.stream().map(Payment::getPatientId).distinct().toList()),
				Patient::getId);
		Map<UUID, MedicalCase> caseById = byId(
				cases.findAllById(patientPayments.stream().map(Payment::getCaseId).distinct().toList()),
				MedicalCase::getId);
		Map<UUID, Doctor> doctorById = byId(
				doctors.findAllById(doctorPayments.stream().map(DoctorFeePayment::getDoctorId).distinct().toList()),
				Doctor::getId);
		List<PaymentRow> rows = new ArrayList<>();
		for (Payment p : patientPayments) {
			Patient patient = patientById.get(p.getPatientId());
			MedicalCase c = caseById.get(p.getCaseId());
			rows.add(PaymentRow.of(RefundService.PATIENT, p.getId(),
					Payment.CONSULTATION_FEE.equals(p.getPaymentType()) ? "consultation" : "treatment",
					patient == null ? null : patient.getFullName(), p.getPatientId(), p.getCaseId(),
					c == null ? null : c.getReferenceNumber(), p.getAmountAud(), p.getStatus(), p.getGateway(),
					p.getGatewayReference(), p.getPaidAt(), refunded.getOrDefault(p.getId(), List.of())));
		}
		for (DoctorFeePayment p : doctorPayments) {
			Doctor d = doctorById.get(p.getDoctorId());
			rows.add(PaymentRow.of(RefundService.DOCTOR, p.getId(), p.getFeeType(), d == null ? null : d.getFullName(),
					p.getDoctorId(), null, null, p.getAmountAud(), p.getStatus(), p.getGateway(), p.getGatewayReference(),
					p.getPaidAt(), refunded.getOrDefault(p.getId(), List.of())));
		}
		rows.sort(Comparator.comparing(PaymentRow::paidAt).reversed());
		return rows;
	}

	private static <T> Map<UUID, T> byId(List<T> list, Function<T, UUID> id) {
		return list.stream().collect(Collectors.toMap(id, Function.identity(), (a, b) -> a));
	}

	/** {@code amountAud}: the part of the payment to refund; the card fee is deducted unless waived. */
	public record RefundRequest(@NotNull BigDecimal amountAud, @NotBlank String reason, @Size(max = 1000) String note,
			Boolean waiveFee) {
	}

	/**
	 * @param type treatment, consultation, registration or annual
	 * @param payerId the patient or doctor id
	 * @param refundedAud refunded so far (before fees); {@code refundedToCardAud} after fees
	 */
	public record PaymentRow(String kind, UUID id, String type, String payerName, UUID payerId, UUID caseId,
			String caseReference, BigDecimal amountAud, String status, String gateway, String gatewayReference,
			Instant paidAt, BigDecimal refundedAud, BigDecimal refundedToCardAud, int refundCount) {

		static PaymentRow of(String kind, UUID id, String type, String payerName, UUID payerId, UUID caseId,
				String caseReference, BigDecimal amount, String status, String gateway, String reference, Instant paidAt,
				List<PaymentRefund> refunds) {
			return new PaymentRow(kind, id, type, payerName, payerId, caseId, caseReference, amount, status, gateway,
					reference, paidAt,
					refunds.stream().map(PaymentRefund::getAmountAud).reduce(BigDecimal.ZERO, BigDecimal::add),
					refunds.stream().map(PaymentRefund::getRefundedAud).reduce(BigDecimal.ZERO, BigDecimal::add),
					refunds.size());
		}

	}

	public record RefundRow(UUID id, BigDecimal amountAud, BigDecimal feeDeductedAud, BigDecimal refundedAud,
			String feeSource, String reason, String note, String status, String gatewayRefundId, String createdBy,
			Instant createdAt) {

		static RefundRow of(PaymentRefund r) {
			return new RefundRow(r.getId(), r.getAmountAud(), r.getFeeDeductedAud(), r.getRefundedAud(),
					r.getFeeSource(), r.getReason(), r.getNote(), r.getStatus(), r.getGatewayRefundId(),
					r.getCreatedBy(), r.getCreatedAt());
		}

	}

	public record PaymentDetail(PaymentRow payment, RefundService.Quote quote, List<RefundRow> refunds,
			Map<String, String> reasons) {
	}

}
