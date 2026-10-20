package com.iha.payment;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.io.UncheckedIOException;
import java.math.BigDecimal;
import java.text.NumberFormat;
import java.time.Instant;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.List;
import java.util.Locale;

import org.apache.pdfbox.pdmodel.PDDocument;
import org.apache.pdfbox.pdmodel.PDPage;
import org.apache.pdfbox.pdmodel.PDPageContentStream;
import org.apache.pdfbox.pdmodel.common.PDRectangle;
import org.apache.pdfbox.pdmodel.font.PDType1Font;
import org.apache.pdfbox.pdmodel.font.Standard14Fonts;

import org.springframework.stereotype.Component;

/** Draws an A4 payment invoice (replaces the pdf-lib invoice route). */
@Component
class InvoiceRenderer {

	private static final DateTimeFormatter DATE = DateTimeFormatter.ofPattern("d MMMM yyyy", Locale.ENGLISH)
		.withZone(ZoneId.of("Australia/Sydney"));
	private static final float MARGIN = 56;
	private static final float[] BRAND = { 15 / 255f, 110 / 255f, 140 / 255f };

	byte[] render(Invoice invoice) {
		try (PDDocument document = new PDDocument(); ByteArrayOutputStream out = new ByteArrayOutputStream()) {
			PDPage page = new PDPage(PDRectangle.A4);
			document.addPage(page);
			PDType1Font regular = new PDType1Font(Standard14Fonts.FontName.HELVETICA);
			PDType1Font bold = new PDType1Font(Standard14Fonts.FontName.HELVETICA_BOLD);
			float width = page.getMediaBox().getWidth();
			float right = width - MARGIN;
			float y = page.getMediaBox().getHeight() - MARGIN;

			try (PDPageContentStream c = new PDPageContentStream(document, page)) {
				c.setNonStrokingColor(BRAND[0], BRAND[1], BRAND[2]);
				text(c, bold, 22, MARGIN, y, "MTA");
				text(c, regular, 10, MARGIN, y - 16, "Medical Tourism Australia");
				c.setNonStrokingColor(0f, 0f, 0f);
				textRight(c, bold, 18, right, y, "INVOICE");
				textRight(c, regular, 10, right, y - 16, "No. " + invoice.number());

				y -= 64;
				label(c, regular, MARGIN, y, "Issued");
				text(c, regular, 10, MARGIN + 90, y, DATE.format(invoice.paidAt()));
				label(c, regular, MARGIN, y - 16, "Case");
				text(c, regular, 10, MARGIN + 90, y - 16, invoice.caseReference());
				label(c, regular, MARGIN, y - 32, "Payment ref.");
				text(c, regular, 10, MARGIN + 90, y - 32, invoice.paymentReference());

				label(c, regular, width / 2 + 20, y, "Billed to");
				text(c, bold, 10, width / 2 + 90, y, safe(invoice.patientName()));
				text(c, regular, 10, width / 2 + 90, y - 16, safe(invoice.patientEmail()));
				if (invoice.hospital() != null) {
					label(c, regular, width / 2 + 20, y - 32, "Provider");
					text(c, regular, 10, width / 2 + 90, y - 32, safe(invoice.hospital()));
				}

				y -= 80;
				c.setNonStrokingColor(0.95f, 0.96f, 0.97f);
				c.addRect(MARGIN, y - 6, right - MARGIN, 22);
				c.fill();
				c.setNonStrokingColor(0f, 0f, 0f);
				text(c, bold, 10, MARGIN + 8, y, "Description");
				textRight(c, bold, 10, right - 8, y, "Amount (AUD)");
				y -= 26;
				for (Line line : invoice.lines()) {
					text(c, regular, 10, MARGIN + 8, y, safe(line.label()));
					textRight(c, regular, 10, right - 8, y, money(line.amount()));
					y -= 20;
				}
				c.setStrokingColor(0.85f, 0.87f, 0.9f);
				c.moveTo(MARGIN, y + 8);
				c.lineTo(right, y + 8);
				c.stroke();
				y -= 12;
				text(c, bold, 12, MARGIN + 8, y, "Total paid");
				textRight(c, bold, 12, right - 8, y, money(invoice.total()));

				c.setNonStrokingColor(0.4f, 0.45f, 0.5f);
				text(c, regular, 9, MARGIN, MARGIN, "Thank you. This invoice was generated electronically and is valid without a signature.");
			}
			document.save(out);
			return out.toByteArray();
		}
		catch (IOException ex) {
			throw new UncheckedIOException(ex);
		}
	}

	private static void label(PDPageContentStream c, PDType1Font font, float x, float y, String text) throws IOException {
		c.setNonStrokingColor(0.4f, 0.45f, 0.5f);
		text(c, font, 10, x, y, text);
		c.setNonStrokingColor(0f, 0f, 0f);
	}

	private static void text(PDPageContentStream c, PDType1Font font, float size, float x, float y, String text)
			throws IOException {
		c.beginText();
		c.setFont(font, size);
		c.newLineAtOffset(x, y);
		c.showText(text);
		c.endText();
	}

	private static void textRight(PDPageContentStream c, PDType1Font font, float size, float right, float y,
			String text) throws IOException {
		float width = font.getStringWidth(text) / 1000 * size;
		text(c, font, size, right - width, y, text);
	}

	private static String money(BigDecimal amount) {
		NumberFormat format = NumberFormat.getCurrencyInstance(Locale.forLanguageTag("en-AU"));
		return format.format(amount);
	}

	/** The standard PDF fonts only cover Latin-1; replace anything else (e.g. Chinese names) rather than fail. */
	private static String safe(String value) {
		if (value == null) {
			return "";
		}
		StringBuilder out = new StringBuilder();
		value.codePoints().forEach(cp -> out.append(cp < 256 && cp >= 32 ? (char) cp : '?'));
		return out.toString();
	}

	record Line(String label, BigDecimal amount) {
	}

	record Invoice(String number, Instant paidAt, String caseReference, String paymentReference, String patientName,
			String patientEmail, String hospital, List<Line> lines, BigDecimal total) {
	}

}
