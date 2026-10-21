package com.iha.fees;

import java.math.BigDecimal;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** The current fee schedule, for any signed-in user (e.g. the doctor portal's consultation text). */
@RestController
public class FeesController {

	private final FeeSettingsService fees;

	FeesController(FeeSettingsService fees) {
		this.fees = fees;
	}

	@GetMapping("/api/fees")
	public PublicFees fees() {
		return new PublicFees(fees.consultationFeeAud(), fees.amount(FeeSettingsService.DOCTOR_REGISTRATION_FEE),
				fees.amount(FeeSettingsService.DOCTOR_ANNUAL_FEE));
	}

	public record PublicFees(BigDecimal consultationFeeAud, BigDecimal doctorRegistrationFeeAud,
			BigDecimal doctorAnnualFeeAud) {
	}

}
