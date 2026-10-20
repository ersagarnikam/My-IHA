package com.iha.treatment;

import java.util.List;
import java.util.UUID;

import com.iha.auth.CurrentUser;
import com.iha.treatment.TreatmentOptionViews.OptionView;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/patient")
public class PatientTreatmentController {

	private final PatientTreatmentService treatments;

	public PatientTreatmentController(PatientTreatmentService treatments) {
		this.treatments = treatments;
	}

	@GetMapping("/treatment-options")
	public List<OptionView> all(@AuthenticationPrincipal Jwt jwt) {
		return treatments.allOptions(CurrentUser.from(jwt));
	}

	@GetMapping("/treatment-options/{optionId}")
	public OptionView one(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID optionId) {
		return treatments.option(CurrentUser.from(jwt), optionId);
	}

	@GetMapping("/cases/{caseId}/treatment-options")
	public List<OptionView> forCase(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId) {
		return treatments.optionsForCase(CurrentUser.from(jwt), caseId);
	}

	@GetMapping("/cases/{caseId}/treatment-options/selected")
	public OptionView selected(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId) {
		return treatments.selectedOptionForCase(CurrentUser.from(jwt), caseId);
	}

	@PostMapping("/treatment-options/{optionId}/select")
	public OptionView select(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID optionId) {
		return treatments.select(CurrentUser.from(jwt), optionId);
	}

}
