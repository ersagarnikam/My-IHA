package com.iha.dev;

import java.io.ByteArrayInputStream;
import java.io.File;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;

import org.springframework.web.multipart.MultipartFile;

/** An in-memory upload, so dev seeding can go through the same services as real requests. */
record BytesMultipartFile(String name, String originalFilename, String contentType, byte[] bytes)
		implements MultipartFile {

	/** A one-page PDF with a title line. */
	static BytesMultipartFile pdf(String name, String title) {
		return new BytesMultipartFile(name, title.replace(' ', '-') + ".pdf", "application/pdf",
				samplePdf(title).getBytes(StandardCharsets.US_ASCII));
	}

	static String samplePdf(String title) {
		String text = "BT /F1 18 Tf 72 720 Td (" + title.replace('_', ' ') + " - sample document) Tj ET";
		return "%PDF-1.4\n1 0 obj<</Type/Catalog/Pages 2 0 R>>endobj\n2 0 obj<</Type/Pages/Kids[3 0 R]/Count 1>>endobj\n"
				+ "3 0 obj<</Type/Page/Parent 2 0 R/MediaBox[0 0 612 792]/Contents 4 0 R/Resources<</Font<</F1 5 0 R>>>>>>endobj\n"
				+ "4 0 obj<</Length " + text.length() + ">>stream\n" + text + "\nendstream endobj\n"
				+ "5 0 obj<</Type/Font/Subtype/Type1/BaseFont/Helvetica>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF";
	}

	@Override
	public String getName() {
		return name;
	}

	@Override
	public String getOriginalFilename() {
		return originalFilename;
	}

	@Override
	public String getContentType() {
		return contentType;
	}

	@Override
	public boolean isEmpty() {
		return bytes.length == 0;
	}

	@Override
	public long getSize() {
		return bytes.length;
	}

	@Override
	public byte[] getBytes() {
		return bytes.clone();
	}

	@Override
	public InputStream getInputStream() {
		return new ByteArrayInputStream(bytes);
	}

	@Override
	public void transferTo(File dest) throws IOException {
		Files.write(dest.toPath(), bytes);
	}

}
