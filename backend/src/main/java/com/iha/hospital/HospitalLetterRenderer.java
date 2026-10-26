package com.iha.hospital;

import java.awt.Color;
import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;

import org.springframework.stereotype.Component;

/**
 * The two visa-support letters a hospital issues (port of the old
 * {@code lib/pdf/case-letters.ts}): the Hospital Invitation Letter for the
 * visa authorities and the Appointment Confirmation Letter for the patient.
 * Standard fonts only, so characters outside Latin-1 are replaced with "?".
 */
@Component
public class HospitalLetterRenderer {

	private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH);
	private static final ZoneId ZONE = ZoneId.of("Australia/Brisbane");
	private static final Color TEAL = new Color(14, 116, 144);
	private static final Color DARK = new Color(30, 41, 59);
	private static final Color MID = new Color(100, 116, 139);
	private static final Color LIGHT = new Color(148, 163, 184);
	private static final float MARGIN = 56;

	public byte[] invitation(LetterInput in) {
		String condition = in.condition() + (in.procedure() != null ? " (" + in.procedure() + ")" : "");
		return render(in, "Hospital Invitation Letter", "To Whom It May Concern,",
				"This letter confirms that " + in.patientName() + " (Case Reference: " + in.caseReference()
						+ ") has been accepted for medical treatment at " + in.hospitalName() + ", " + in.hospitalCity()
						+ ", " + in.hospitalCountry() + ", for the condition of " + condition + ".",
				List.of(new String[] { "Patient Name", in.patientName() },
						new String[] { "Date of Birth", date(in.patientDateOfBirth()) },
						new String[] { "Country of Residence", dash(in.patientCountry()) },
						new String[] { "Treating Doctor", dash(in.doctorName()) },
						new String[] { "Diagnosis", dash(in.diagnosis()) },
						new String[] { "Planned Admission Date", date(in.admissionDate()) },
						new String[] { "Estimated Length of Stay", dash(in.lengthOfStay()) }),
				"We kindly request that the relevant visa authorities grant " + in.patientName()
						+ " the necessary visa to travel to " + in.hospitalCountry()
						+ " for the purpose of receiving this medical treatment. Should any further information be "
						+ "required, please contact us using the details below.");
	}

	public byte[] appointmentConfirmation(LetterInput in) {
		return render(in, "Appointment Confirmation Letter", "Dear " + in.patientName() + ",",
				"This letter confirms your upcoming appointment and treatment schedule at " + in.hospitalName() + ", "
						+ in.hospitalCity() + ", " + in.hospitalCountry() + " (Case Reference: " + in.caseReference()
						+ ").",
				List.of(new String[] { "Patient Name", in.patientName() },
						new String[] { "Treating Doctor", dash(in.doctorName()) },
						new String[] { "Department", dash(in.department()) },
						new String[] { "Procedure", dash(in.procedure()) },
						new String[] { "Confirmed Admission Date", date(in.admissionDate()) },
						new String[] { "Expected Completion Date", date(in.completionDate()) },
						new String[] { "Estimated Length of Stay", dash(in.lengthOfStay()) }),
				"Please arrive at least 30 minutes prior to your scheduled admission time with a valid passport, "
						+ "visa, and any prior medical records. For questions regarding this appointment, please "
						+ "contact the hospital directly using the details below.");
	}

	private byte[] render(LetterInput in, String title, String salutation, String intro, List<String[]> rows,
			String closing) {
		try (PDDocument document = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
			PDPage page = new PDPage(PDRectangle.A4);
			document.addPage(page);
			PDType1Font regular = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
			PDType1Font bold = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
			float width = page.getMediaBox().getWidth();
			float height = page.getMediaBox().getHeight();
			float content = width - MARGIN * 2;
			try (PDPageContentStream c = new PDPageContentStream(document, page)) {
				// Letterhead: hospital name left, contact lines right, rule underneath.
				float y = height - MARGIN;
				text(c, bold, 16, MARGIN, y - 16, TEAL, in.hospitalName());
				float contactY = y - 4;
				for (String line : contactLines(in)) {
					textRight(c, regular, 8.5f, width - MARGIN, contactY, MID, line);
					contactY -= 12;
				}
				y = Math.min(y - 30, contactY) - 8;
				c.setStrokingColor(TEAL);
				c.setLineWidth(1.2f);
				c.moveTo(MARGIN, y);
				c.lineTo(width - MARGIN, y);
				c.stroke();

				y -= 34;
				text(c, bold, 15, MARGIN, y, DARK, title);
				y -= 18;
				text(c, regular, 9.5f, MARGIN, y, MID, "Date: " + LocalDate.now(ZONE).format(DATE));
				y -= 30;

				text(c, bold, 10.5f, MARGIN, y, DARK, salutation);
				y -= 22;
				y = paragraph(c, regular, intro, MARGIN, y, 10, content, 15);
				y -= 10;
				for (String[] row : rows) {
					text(c, regular, 9.5f, MARGIN, y, MID, row[0]);
					text(c, bold, 9.5f, MARGIN + 190, y, DARK, row[1]);
					y -= 18;
				}
				y -= 10;
				y = paragraph(c, regular, closing, MARGIN, y, 10, content, 15);

				y -= 40;
				text(c, regular, 10, MARGIN, y, DARK, "Sincerely,");
				y -= 34;
				text(c, bold, 10, MARGIN, y, DARK, in.hospitalName());
				y -= 14;
				text(c, regular, 8.5f, MARGIN, y, MID,
						"This is a computer-generated letter issued on behalf of the hospital.");
				text(c, regular, 8, MARGIN, 44, LIGHT, "Case Reference: " + in.caseReference());
			}
			document.save(out);
			return out.toByteArray();
		}
		catch (IOException ex) {
			throw new UncheckedIOException("Could not render the hospital letter", ex);
		}
	}

	private static List<String> contactLines(LetterInput in) {
		List<String> lines = new ArrayList<>();
		if (in.hospitalAddress() != null && !in.hospitalAddress().isBlank()) {
			lines.add(in.hospitalAddress());
		}
		lines.add(in.hospitalCity() + ", " + in.hospitalCountry()
				+ (in.hospitalZip() != null && !in.hospitalZip().isBlank() ? " " + in.hospitalZip() : ""));
		if (in.hospitalPhone() != null && !in.hospitalPhone().isBlank()) {
			lines.add("Phone: " + in.hospitalPhone());
		}
		if (in.hospitalEmail() != null && !in.hospitalEmail().isBlank()) {
			lines.add(in.hospitalEmail());
		}
		return lines;
	}

	/** Word-wrapped paragraph; returns the y below it. */
	private static float paragraph(PDPageContentStream c, PDType1Font font, String value, float x, float y, float size,
			float maxWidth, float lineHeight) throws IOException {
		StringBuilder line = new StringBuilder();
		for (String word : safe(value).split(" ")) {
			String candidate = line.isEmpty() ? word : line + " " + word;
			if (font.getStringWidth(candidate) / 1000 * size > maxWidth && !line.isEmpty()) {
				text(c, font, size, x, y, DARK, line.toString());
				y -= lineHeight;
				line = new StringBuilder(word);
			}
			else {
				line = new StringBuilder(candidate);
			}
		}
		if (!line.isEmpty()) {
			text(c, font, size, x, y, DARK, line.toString());
			y -= lineHeight;
		}
		return y;
	}

	private static void text(PDPageContentStream c, PDType1Font font, float size, float x, float y, Color color,
			String value) throws IOException {
		c.beginText();
		c.setFont(font, size);
		c.setNonStrokingColor(color);
		c.newLineAtOffset(x, y);
		c.showText(safe(value));
		c.endText();
	}

	private static void textRight(PDPageContentStream c, PDType1Font font, float size, float right, float y,
			Color color, String value) throws IOException {
		float w = font.getStringWidth(safe(value)) / 1000 * size;
		text(c, font, size, right - w, y, color, value);
	}

	private static String date(LocalDate value) {
		return value == null ? "—" : value.format(DATE);
	}

	private static String dash(String value) {
		return value == null || value.isBlank() ? "—" : value;
	}

	/** Standard fonts can't encode characters outside Latin-1. */
	static String safe(String value) {
		if (value == null) {
			return "";
		}
		StringBuilder out = new StringBuilder();
		value.codePoints().forEach(cp -> out.append(cp == '—' ? '-' : cp < 256 && cp >= 32 ? (char) cp : '?'));
		return out.toString();
	}

	public record LetterInput(String hospitalName, String hospitalAddress, String hospitalCity, String hospitalCountry,
			String hospitalZip, String hospitalPhone, String hospitalEmail, String caseReference, String condition,
			String patientName, LocalDate patientDateOfBirth, String patientCountry, String doctorName,
			String diagnosis, String procedure, String department, LocalDate admissionDate, LocalDate completionDate,
			String lengthOfStay) {
	}

}
