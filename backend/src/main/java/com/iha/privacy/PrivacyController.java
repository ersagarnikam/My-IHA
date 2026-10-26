package com.iha.privacy;

import com.iha.fees.BusinessSettingsService;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** The links and consent version the sign-up pages show (public, under {@code /api/auth}). */
@RestController
public class PrivacyController {

	private final BusinessSettingsService settings;

	PrivacyController(BusinessSettingsService settings) {
		this.settings = settings;
	}

	@GetMapping("/api/auth/privacy")
	public PrivacyLinks links() {
		BusinessSettingsService.Privacy p = settings.privacy();
		return new PrivacyLinks(p.privacyPolicyUrl(), p.termsUrl(), p.consentVersion());
	}

	public record PrivacyLinks(String privacyPolicyUrl, String termsUrl, String consentVersion) {
	}

}
