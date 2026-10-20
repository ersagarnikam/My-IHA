package com.iha.storage;

import java.util.Arrays;
import java.util.Optional;
import java.util.Set;

/**
 * Upload formats the platform accepts, detected from a file's leading bytes —
 * never from the client-supplied content type or file name.
 */
public enum FileType {

	PDF("application/pdf", ".pdf"),
	JPEG("image/jpeg", ".jpg"),
	PNG("image/png", ".png"),
	WEBP("image/webp", ".webp");

	/** Medical and visa documents. */
	public static final Set<FileType> DOCUMENTS = Set.of(PDF, JPEG, PNG);

	/** Profile pictures and passport photos. */
	public static final Set<FileType> IMAGES = Set.of(JPEG, PNG, WEBP);

	private final String mimeType;
	private final String extension;

	FileType(String mimeType, String extension) {
		this.mimeType = mimeType;
		this.extension = extension;
	}

	public String mimeType() {
		return mimeType;
	}

	public String extension() {
		return extension;
	}

	public static FileType fromMimeType(String mimeType) {
		return Arrays.stream(values())
			.filter(type -> type.mimeType.equals(mimeType))
			.findFirst()
			.orElseThrow(() -> new IllegalArgumentException("Unsupported MIME type: " + mimeType));
	}

	public static Optional<FileType> detect(byte[] content) {
		if (startsWith(content, 0, '%', 'P', 'D', 'F', '-')) {
			return Optional.of(PDF);
		}
		if (startsWith(content, 0, 0xFF, 0xD8, 0xFF)) {
			return Optional.of(JPEG);
		}
		if (startsWith(content, 0, 0x89, 'P', 'N', 'G', '\r', '\n', 0x1A, '\n')) {
			return Optional.of(PNG);
		}
		if (startsWith(content, 0, 'R', 'I', 'F', 'F') && startsWith(content, 8, 'W', 'E', 'B', 'P')) {
			return Optional.of(WEBP);
		}
		return Optional.empty();
	}

	private static boolean startsWith(byte[] content, int offset, int... magic) {
		if (content.length < offset + magic.length) {
			return false;
		}
		byte[] expected = new byte[magic.length];
		for (int i = 0; i < magic.length; i++) {
			expected[i] = (byte) magic[i];
		}
		return Arrays.equals(content, offset, offset + magic.length, expected, 0, magic.length);
	}

}
