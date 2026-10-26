package com.iha.admin;

import java.time.Instant;
import java.util.List;
import java.util.UUID;
import java.util.stream.IntStream;

import com.iha.auth.CurrentUser;
import com.iha.common.ApiException;
import com.iha.documents.PatientDocumentController;
import com.iha.hospital.HospitalAccountService;
import com.iha.hospital.HospitalAdminService;
import com.iha.provider.DoctorHospitalAffiliationRepository;
import com.iha.provider.Hospital;
import com.iha.treatment.TreatmentPlan;
import com.iha.treatment.TreatmentPlanRepository;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.core.io.Resource;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** MTA admin: hospital registrations and their review. */
@RestController
@RequestMapping("/api/admin/hospitals")
public class AdminHospitalController {

	private final HospitalAdminService hospitals;
	private final HospitalAccountService accounts;
	private final DoctorHospitalAffiliationRepository affiliations;
	private final TreatmentPlanRepository plans;

	AdminHospitalController(HospitalAdminService hospitals, HospitalAccountService accounts,
			DoctorHospitalAffiliationRepository affiliations, TreatmentPlanRepository plans) {
		this.hospitals = hospitals;
		this.accounts = accounts;
		this.affiliations = affiliations;
		this.plans = plans;
	}

	@GetMapping
	public List<HospitalRow> list() {
		return hospitals.registered().stream().map(this::row).toList();
	}

	@GetMapping("/{hospitalId}")
	public HospitalDetail detail(@PathVariable UUID hospitalId) {
		Hospital h = hospitals.hospital(hospitalId);
		List<HospitalAccountService.RegistrationDocument> docs = accounts.documents(h);
		return new HospitalDetail(row(h), h.getRegistrationNumber(), h.getAbnNumber(), h.getPhone(), h.getAddress(),
				h.getZipCode(), h.getRegistrationType(), h.getBedCount(), list(h.getRoomTypes()), h.getLicenseNumber(),
				h.getAccreditationBody(), h.getRejectionReason(), h.getMoreInfoMessage(),
				IntStream.range(0, docs.size())
					.mapToObj(i -> new DocumentResponse(i, docs.get(i).fileName(), docs.get(i).category(),
							docs.get(i).mimeType(), docs.get(i).fileSizeBytes()))
					.toList());
	}

	@GetMapping("/{hospitalId}/documents/{index}")
	public ResponseEntity<Resource> document(@PathVariable UUID hospitalId, @PathVariable int index,
			@RequestParam(defaultValue = "false") boolean download) {
		Hospital h = hospitals.hospital(hospitalId);
		List<HospitalAccountService.RegistrationDocument> docs = accounts.documents(h);
		if (index < 0 || index >= docs.size()) {
			throw ApiException.notFound("Document not found.");
		}
		HospitalAccountService.RegistrationDocument doc = docs.get(index);
		return PatientDocumentController.file(accounts.loadDocument(h, index), doc.mimeType(), doc.fileName(),
				download);
	}

	/** {@code outcome}: approved, rejected or more_info_requested (reason required for the last two). */
	@PostMapping("/{hospitalId}/review")
	public HospitalRow review(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID hospitalId,
			@Valid @RequestBody ReviewRequest request) {
		if (!Hospital.APPROVED.equals(request.outcome()) && (request.reason() == null || request.reason().isBlank())) {
			throw ApiException.badRequest("reason_required", "Tell the hospital what to change or why.");
		}
		return row(hospitals.review(CurrentUser.from(jwt), hospitalId, request.outcome(),
				request.reason() == null ? null : request.reason().trim()));
	}

	private HospitalRow row(Hospital h) {
		long plansNamingIt = plans.findByHospitalIdAndStatusNot(h.getId(), TreatmentPlan.DRAFT).size();
		return new HospitalRow(h.getId(), h.getName(), h.getContactEmail(), h.getCity(), h.getCountry(),
				list(h.getSpecialties()), h.getStatus(), h.getCreatedAt(), affiliations.findByHospitalId(h.getId()).size(),
				plansNamingIt);
	}

	private static List<String> list(String[] values) {
		return values == null ? List.of() : List.of(values);
	}

	public record ReviewRequest(@NotBlank String outcome, @Size(max = 1000) String reason) {
	}

	public record HospitalRow(UUID id, String name, String email, String city, String country,
			List<String> specialties, String status, Instant createdAt, long doctors, long plans) {
	}

	public record DocumentResponse(int index, String fileName, String category, String mimeType, long fileSizeBytes) {
	}

	public record HospitalDetail(HospitalRow hospital, String registrationNumber, String abnNumber, String phone,
			String address, String zipCode, String registrationType, Integer bedCount, List<String> roomTypes,
			String licenseNumber, String accreditationBody, String rejectionReason, String moreInfoMessage,
			List<DocumentResponse> documents) {
	}

}
