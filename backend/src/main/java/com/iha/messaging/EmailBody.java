package com.iha.messaging;

import org.springframework.web.util.HtmlUtils;

/** One email in HTML and plain text, in the layout of the old {@code NotificationEmail} template. */
public record EmailBody(String html, String text) {

	/** A heading and message, with an optional button and a link to the recipient's preferences. */
	public static EmailBody of(String heading, String message, String ctaLabel, String ctaUrl, String preferencesUrl) {
		StringBuilder html = new StringBuilder();
		html.append("<!doctype html><html><body style=\"background-color:#f8fafc;margin:0;padding:24px 0;")
			.append("font-family:Helvetica,Arial,sans-serif\">")
			.append("<div style=\"background-color:#ffffff;margin:0 auto;padding:32px;max-width:480px\">")
			.append("<p style=\"font-size:18px;font-weight:700;color:#0e7490;margin:0 0 24px\">MTA</p>")
			.append("<h1 style=\"font-size:20px;color:#0f172a;margin:0 0 16px\">")
			.append(escape(heading))
			.append("</h1><p style=\"font-size:14px;color:#475569;line-height:22px;margin:0 0 24px\">")
			.append(escape(message))
			.append("</p>");
		if (ctaUrl != null) {
			html.append("<p style=\"margin:0 0 24px\"><a href=\"")
				.append(escape(ctaUrl))
				.append("\" style=\"background-color:#0e7490;border-radius:8px;color:#ffffff;font-size:14px;")
				.append("font-weight:600;padding:12px 24px;text-decoration:none;display:inline-block\">")
				.append(escape(ctaLabel))
				.append("</a></p>");
		}
		html.append("<hr style=\"border:0;border-top:1px solid #e2e8f0;margin:24px 0\">")
			.append("<p style=\"font-size:12px;color:#94a3b8;line-height:18px;margin:0\">Medical Tourism Australia");
		if (preferencesUrl != null) {
			html.append("<br><a href=\"")
				.append(escape(preferencesUrl))
				.append("\" style=\"color:#0e7490\">Manage notification preferences</a>");
		}
		html.append("</p></div></body></html>");

		StringBuilder text = new StringBuilder(heading).append("\n\n").append(message);
		if (ctaUrl != null) {
			text.append("\n\n").append(ctaLabel).append(": ").append(ctaUrl);
		}
		text.append("\n\n--\nMedical Tourism Australia");
		if (preferencesUrl != null) {
			text.append("\nManage notification preferences: ").append(preferencesUrl);
		}
		return new EmailBody(html.toString(), text.toString());
	}

	/** Names and reasons in messages come from users, so nothing goes into the HTML unescaped. */
	private static String escape(String value) {
		return HtmlUtils.htmlEscape(value);
	}

}
