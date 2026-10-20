package com.iha.documents;

import java.time.Instant;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.Stream;

import com.iha.auth.CurrentUser;
import com.iha.cases.CaseDocument;
import com.iha.cases.CaseService;
import com.iha.cases.MedicalCase;
import com.iha.common.ApiException;
import com.iha.visa.VisaDocument;
import com.iha.visa.VisaService;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotNull;

import org.springframework.core.io.Resource;
import org.springframework.http.ContentDisposition;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.multipart.MultipartFile;

/**
 * The Documents page: medical and visa files in one list, standalone uploads
 * and linking a file to a case. Files are streamed through the API so storage
 * paths (which contain patient ids) never reach the browser.
 */
@RestController
@RequestMapping("/api/patient/documents")
public class PatientDocumentController {

	static final String MEDICAL = "medical";
	static final String VISA = "visa";

	private final CaseService caseService;
	private final VisaService visaService;

	public PatientDocumentController(CaseService caseService, VisaService visaService) {
		this.caseService = caseService;
		this.visaService = visaService;
	}

	@GetMapping
	public List<DocumentRow> list(@AuthenticationPrincipal Jwt jwt) {
		CurrentUser user = CurrentUser.from(jwt);
		Map<UUID, MedicalCase> cases = caseService.listForPatient(user).stream()
			.map(CaseService.CaseSummary::medicalCase)
			.collect(Collectors.toMap(MedicalCase::getId, c -> c));
		Stream<DocumentRow> medical = caseService.allDocumentsForPatient(user).stream()
			.map(d -> DocumentRow.medical(d, cases.get(d.getCaseId())));
		Stream<DocumentRow> visa = visaService.allDocuments(user).stream()
			.map(d -> DocumentRow.visa(d, cases.get(d.getCaseId())));
		return Stream.concat(medical, visa).sorted(Comparator.comparing(DocumentRow::uploadedAt).reversed()).toList();
	}

	/** {@code category} is medical or visa; {@code type} is the medical document type or the visa category. */
	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	public DocumentRow upload(@AuthenticationPrincipal Jwt jwt, @RequestParam String category,
			@RequestParam String type, @RequestParam(required = false) UUID caseId,
			@RequestParam MultipartFile file) {
		CurrentUser user = CurrentUser.from(jwt);
		return switch (category) {
			case MEDICAL -> DocumentRow.medical(caseService.uploadStandalone(user, type, file, caseId),
					caseId == null ? null : caseService.getForPatient(user, caseId));
			case VISA -> DocumentRow.visa(caseId == null ? visaService.uploadUnlinked(user, type, file)
					: visaService.uploadForCase(user, caseId, type, file),
					caseId == null ? null : caseService.getForPatient(user, caseId));
			default -> throw ApiException.badRequest("invalid_category", "Category must be medical or visa.");
		};
	}

	@PostMapping("/{category}/{documentId}/link")
	public DocumentRow link(@AuthenticationPrincipal Jwt jwt, @PathVariable String category,
			@PathVariable UUID documentId, @Valid @RequestBody LinkRequest request) {
		CurrentUser user = CurrentUser.from(jwt);
		MedicalCase medicalCase = caseService.getForPatient(user, request.caseId());
		return switch (category) {
			case MEDICAL -> DocumentRow.medical(caseService.linkToCase(user, documentId, request.caseId()), medicalCase);
			case VISA -> DocumentRow.visa(visaService.linkToCase(user, documentId, request.caseId()), medicalCase);
			default -> throw ApiException.badRequest("invalid_category", "Category must be medical or visa.");
		};
	}

	@GetMapping("/medical/{documentId}/content")
	public ResponseEntity<Resource> medicalContent(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID documentId,
			@RequestParam(defaultValue = "false") boolean download) {
		CaseService.StoredDocument stored = caseService.openDocumentForPatient(CurrentUser.from(jwt), documentId);
		return file(stored.content(), stored.document().getMimeType(), stored.document().getFileName(), download);
	}

	@GetMapping("/visa/{documentId}/content")
	public ResponseEntity<Resource> visaContent(@AuthenticationPrincipal Jwt jwt, @PathVariable UUID documentId,
			@RequestParam(defaultValue = "false") boolean download) {
		VisaService.Stored stored = visaService.open(CurrentUser.from(jwt), documentId);
		return file(stored.content(), stored.document().getMimeType(), stored.document().getFileName(), download);
	}

	public static ResponseEntity<Resource> file(Resource content, String mimeType, String fileName, boolean download) {
		ContentDisposition disposition = (download ? ContentDisposition.attachment() : ContentDisposition.inline())
			.filename(fileName)
			.build();
		return ResponseEntity.ok()
			.contentType(mimeType != null ? MediaType.parseMediaType(mimeType) : MediaType.APPLICATION_OCTET_STREAM)
			.header(HttpHeaders.CONTENT_DISPOSITION, disposition.toString())
			.header(HttpHeaders.CACHE_CONTROL, "private, no-store")
			.body(content);
	}

	public record LinkRequest(@NotNull UUID caseId) {
	}

	/**
	 * @param category medical or visa
	 * @param type the medical document type or the visa document category
	 * @param source for visa documents: patient_upload, hospital_generated or lawyer_issued
	 */
	public record DocumentRow(UUID id, String category, String type, String source, String fileName, String mimeType,
			Long fileSizeBytes, UUID caseId, String caseReference, String caseSpecialty, String caseStatus,
			Instant uploadedAt) {

		static DocumentRow medical(CaseDocument d, MedicalCase c) {
			return new DocumentRow(d.getId(), MEDICAL, d.getDocumentType(), VisaDocument.PATIENT_UPLOAD,
					d.getFileName(), d.getMimeType(), d.getFileSizeBytes(), d.getCaseId(), ref(c), specialty(c),
					status(c), d.getUploadedAt());
		}

		static DocumentRow visa(VisaDocument d, MedicalCase c) {
			return new DocumentRow(d.getId(), VISA, d.getCategory(), d.getSource(), d.getFileName(), d.getMimeType(),
					d.getFileSizeBytes(), d.getCaseId(), ref(c), specialty(c), status(c), d.getUploadedAt());
		}

		private static String ref(MedicalCase c) {
			return c == null ? null : c.getReferenceNumber();
		}

		private static String specialty(MedicalCase c) {
			return c == null ? null : c.getSpecialtyOther() != null ? c.getSpecialtyOther() : c.getSpecialty();
		}

		private static String status(MedicalCase c) {
			return c == null ? null : c.getStatus().dbValue();
		}

	}

}
