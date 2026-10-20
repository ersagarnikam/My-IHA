package com.iha.doctor;

import com.iha.auth.CurrentUser;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

/** Figures for the doctor dashboard. */
@RestController
public class DoctorInsightsController {

	private final DoctorInsightsService insights;

	DoctorInsightsController(DoctorInsightsService insights) {
		this.insights = insights;
	}

	@GetMapping("/api/doctor/insights")
	public DoctorInsightsService.Insights insights(@AuthenticationPrincipal Jwt jwt) {
		return insights.insights(CurrentUser.from(jwt));
	}

}
