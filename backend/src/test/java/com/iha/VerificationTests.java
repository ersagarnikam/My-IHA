package com.iha;

import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;

import com.iha.common.ApiException;
import com.iha.provider.Doctor;
import com.iha.provider.DoctorRepository;
import com.iha.verification.ComplianceService;
import com.iha.verification.ProviderVerification;
import com.iha.verification.VerificationService;
import org.junit.jupiter.api.Test;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

/**
 * Register checks and the compliance alerts on the admin dashboard: a lapsed
 * AHPRA check blocks approval and shows as expired, one ending within 30 days
 * as expiring; an active doctor without an indemnity declaration is flagged.
 */
@SpringBootTest
class VerificationTests {

	@Autowired
	DoctorRepository doctors;

	@Autowired
	VerificationService verification;

	@Autowired
	ComplianceService compliance;

	@Test
	void expiryAndAlerts() {
		LocalDate today = LocalDate.now(ZoneId.of("Australia/Brisbane"));
		Doctor doctor = doctors.save(new Doctor(null, "Dr. Lapsed Registration"));
		assertThat(alerts(doctor)).extracting(ComplianceService.Alert::item, ComplianceService.Alert::status)
			.containsExactly(org.assertj.core.groups.Tuple.tuple("ahpra", "missing"));

		verification.record(null, ProviderVerification.DOCTOR, doctor.getId(), ProviderVerification.AHPRA,
				ProviderVerification.VERIFIED, today.minusDays(1), null);
		assertThatThrownBy(() -> verification.requirePassing(ProviderVerification.DOCTOR, doctor.getId()))
			.isInstanceOf(ApiException.class);
		assertThat(alerts(doctor)).extracting(ComplianceService.Alert::status).containsExactly("expired");

		verification.record(null, ProviderVerification.DOCTOR, doctor.getId(), ProviderVerification.AHPRA,
				ProviderVerification.VERIFIED_WITH_CONDITIONS, today.plusDays(10), "Supervised practice only");
		verification.requirePassing(ProviderVerification.DOCTOR, doctor.getId());
		assertThat(alerts(doctor)).extracting(ComplianceService.Alert::status).containsExactly("expiring");

		verification.record(null, ProviderVerification.DOCTOR, doctor.getId(), ProviderVerification.AHPRA,
				ProviderVerification.VERIFIED, today.plusYears(1), null);
		assertThat(alerts(doctor)).isEmpty();

		// Once active, the indemnity declaration is tracked too.
		doctor.markRegistrationFeePaid(Instant.now(), Instant.now().plus(365, ChronoUnit.DAYS));
		doctors.save(doctor);
		assertThat(alerts(doctor)).extracting(ComplianceService.Alert::item, ComplianceService.Alert::status)
			.containsExactly(org.assertj.core.groups.Tuple.tuple("indemnity", "missing"));
		doctor.declareIndemnity("Avant", "AV-1", today.plusDays(5), true, true);
		doctors.save(doctor);
		assertThat(alerts(doctor)).extracting(ComplianceService.Alert::status).containsExactly("expiring");
	}

	private List<ComplianceService.Alert> alerts(Doctor doctor) {
		return compliance.alerts().stream().filter(a -> a.providerId().equals(doctor.getId())).toList();
	}

}
