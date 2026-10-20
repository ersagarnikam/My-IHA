package com.iha.cases;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

import com.iha.auth.CurrentUser;
import com.iha.notification.NotificationController.NotificationResponse;
import com.iha.notification.NotificationService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Size;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.ModelAttribute;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

@RestController
@RequestMapping("/api/patient/cases")
public class PatientCaseController {

	private final CaseService caseService;
	private final NotificationService notificationService;

	public PatientCaseController(CaseService caseService, NotificationService notificationService) {
		this.caseService = caseService;
		this.notificationService = notificationService;
	}

	@GetMapping
	public List<CaseSummaryResponse> list(@AuthenticationPrincipal Jwt jwt) {
		return caseService.listForPatient(CurrentUser.from(jwt)).stream()
			.map(s -> CaseSummaryResponse.of(s.medicalCase(), s.documentCount()))
			.toList();
	}

	/**
	 * Multipart form: {@code specialty}, {@code specialtyOther}, {@code description},
	 * and parallel lists {@code files} / {@code documentTypes} (one type per file, same order).
	 */
	@PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	public CaseSummaryResponse submit(@AuthenticationPrincipal Jwt jwt, @Valid @ModelAttribute SubmitCaseForm form) {
		CurrentUser user = CurrentUser.from(jwt);
		MedicalCase created = caseService.submit(user, form.specialty(), form.specialtyOther(), form.description(),
				form.documentTypes(), form.files());
		long documentCount = form.files() == null ? 0 : form.files().stream().filter(f -> !f.isEmpty()).count();
		return CaseSummaryResponse.of(created, documentCount);
	}

	@GetMapping("/{caseId}")
	public CaseDetailResponse get(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId) {
		CurrentUser user = CurrentUser.from(jwt);
		MedicalCase medicalCase = caseService.getForPatient(user, caseId);
		List<DocumentResponse> docs = caseService.documentsForPatient(user, caseId).stream()
			.map(DocumentResponse::of)
			.toList();
		List<NotificationResponse> timeline = notificationService.forCase(user.id(), caseId).stream()
			.map(NotificationResponse::of)
			.toList();
		return CaseDetailResponse.of(medicalCase, docs, timeline);
	}

	@PostMapping(path = "/{caseId}/documents", consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
	@ResponseStatus(HttpStatus.CREATED)
	public List<DocumentResponse> addDocuments(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
			@RequestParam List<String> documentTypes, @RequestParam List<MultipartFile> files) {
		return caseService.addDocuments(CurrentUser.from(jwt), caseId, documentTypes, files).stream()
			.map(DocumentResponse::of)
			.toList();
	}

	@PutMapping("/{caseId}/travel-assistance")
	public CaseSummaryResponse travelAssistance(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID caseId,
			@Valid @RequestBody TravelAssistanceRequest request) {
		MedicalCase updated = caseService.updateTravelAssistance(CurrentUser.from(jwt), caseId,
				request.needTravelAssistance(), request.needStayBookingAssistance(),
				request.needTransportationAssistance());
		return CaseSummaryResponse.of(updated, 0);
	}

	public record SubmitCaseForm(
			@NotBlank(message = "Please select a medical specialty") String specialty,
			@Size(max = 100, message = "Max 100 characters") String specialtyOther,
			@NotBlank @Size(min = 50, max = 2000,
					message = "Please describe your condition in 50–2000 characters") String description,
			List<String> documentTypes,
			List<MultipartFile> files) {
	}

	public record TravelAssistanceRequest(boolean needTravelAssistance, boolean needStayBookingAssistance,
			boolean needTransportationAssistance) {
	}

	public record CaseSummaryResponse(UUID id, String referenceNumber, String specialty, String specialtyOther,
			CaseStatus status, long documentCount, Instant createdAt, Instant updatedAt) {

		public static CaseSummaryResponse of(MedicalCase c, long documentCount) {
			return new CaseSummaryResponse(c.getId(), c.getReferenceNumber(), c.getSpecialty(), c.getSpecialtyOther(),
					c.getStatus(), documentCount, c.getCreatedAt(), c.getUpdatedAt());
		}

	}

	public record DocumentResponse(UUID id, UUID caseId, String documentType, String fileName, String mimeType,
			long fileSizeBytes, Instant uploadedAt) {

		public static DocumentResponse of(CaseDocument d) {
			return new DocumentResponse(d.getId(), d.getCaseId(), d.getDocumentType(), d.getFileName(),
					d.getMimeType(), d.getFileSizeBytes(), d.getUploadedAt());
		}

	}

	public record CaseDetailResponse(UUID id, String referenceNumber, String specialty, String specialtyOther,
			String description, CaseStatus status, boolean needTravelAssistance, boolean needStayBookingAssistance,
			boolean needTransportationAssistance, boolean canAddDocuments, int maxDocuments, Instant createdAt,
			Instant updatedAt, List<DocumentResponse> documents, List<NotificationResponse> timeline) {

		static CaseDetailResponse of(MedicalCase c, List<DocumentResponse> documents,
				List<NotificationResponse> timeline) {
			return new CaseDetailResponse(c.getId(), c.getReferenceNumber(), c.getSpecialty(), c.getSpecialtyOther(),
					c.getDescription(), c.getStatus(), c.isNeedTravelAssistance(), c.isNeedStayBookingAssistance(),
					c.isNeedTransportationAssistance(),
					CaseService.MEDICAL_UPLOAD_STATUSES.contains(c.getStatus())
							&& documents.size() < CaseService.MAX_FILES_PER_CASE,
					CaseService.MAX_FILES_PER_CASE, c.getCreatedAt(), c.getUpdatedAt(), documents, timeline);
		}

	}

}
