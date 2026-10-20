package com.iha.specialty;

import java.util.List;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;

@RestController
public class SpecialtyController {

	private final SpecialtyRepository specialties;

	public SpecialtyController(SpecialtyRepository specialties) {
		this.specialties = specialties;
	}

	@GetMapping("/api/specialties")
	public List<SpecialtyResponse> list() {
		return specialties.findByActiveTrueOrderBySortOrder().stream()
			.map(s -> new SpecialtyResponse(s.getName(), s.getLabelEn(), s.getLabelZh()))
			.toList();
	}

	public record SpecialtyResponse(String name, String labelEn, String labelZh) {
	}

}
