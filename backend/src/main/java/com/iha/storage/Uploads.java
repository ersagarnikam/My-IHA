package com.iha.storage;

import java.io.IOException;
import java.io.UncheckedIOException;
import java.util.Set;

import com.iha.common.ApiException;

import org.springframework.web.multipart.MultipartFile;

/** Validation shared by every upload endpoint. */
public final class Uploads {

	public static final long DOCUMENT_MAX_BYTES = 10L * 1024 * 1024;
	public static final long AVATAR_MAX_BYTES = 5L * 1024 * 1024;

	private Uploads() {
	}

	/** Reads and checks one upload: non-empty, within {@code maxBytes}, and one of {@code allowed}. */
	public static ValidatedUpload validate(MultipartFile file, long maxBytes, Set<FileType> allowed) {
		if (file == null || file.isEmpty()) {
			throw ApiException.badRequest("file_required", "Please choose a file.");
		}
		if (file.getSize() > maxBytes) {
			throw ApiException.badRequest("file_too_large",
					"Each file must be %d MB or smaller.".formatted(maxBytes / 1024 / 1024));
		}
		byte[] content;
		try {
			content = file.getBytes();
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
		FileType type = FileType.detect(content)
			.filter(allowed::contains)
			.orElseThrow(() -> ApiException.badRequest("unsupported_file_type", allowed.contains(FileType.PDF)
					? "Only PDF, JPEG and PNG files are accepted." : "Only JPEG, PNG and WebP images are accepted."));
		return new ValidatedUpload(type, content, file.getOriginalFilename());
	}

	public record ValidatedUpload(FileType type, byte[] content, String originalName) {
	}

}
