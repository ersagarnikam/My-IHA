package com.iha.zoom;

import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.Map;

import com.fasterxml.jackson.annotation.JsonProperty;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

/**
 * Zoom REST client using account credentials (Server-to-Server OAuth), like the
 * old {@code createZoomMeeting}: a scheduled UTC meeting with join-before-host.
 */
@Component
class ZoomApiClient implements ZoomClient {

	private static final Logger log = LoggerFactory.getLogger(ZoomApiClient.class);

	private final ZoomProperties properties;
	private final RestClient http;

	ZoomApiClient(ZoomProperties properties) {
		this.properties = properties;
		this.http = RestClient.create();
	}

	@Override
	public String createMeeting(String topic, Instant start, Duration duration, String timeZone) {
		if (!properties.isConfigured()) {
			log.warn("Zoom is not configured (iha.zoom.*); no meeting created for '{}'", topic);
			return null;
		}
		String basic = Base64.getEncoder()
			.encodeToString((properties.clientId() + ":" + properties.clientSecret()).getBytes(StandardCharsets.UTF_8));
		TokenResponse token = http.post()
			.uri("https://zoom.us/oauth/token?grant_type=account_credentials&account_id={id}", properties.accountId())
			.header("Authorization", "Basic " + basic)
			.retrieve()
			.body(TokenResponse.class);
		MeetingResponse meeting = http.post()
			.uri("https://api.zoom.us/v2/users/me/meetings")
			.header("Authorization", "Bearer " + token.accessToken())
			.contentType(MediaType.APPLICATION_JSON)
			.body(Map.of("topic", topic, "type", 2, "start_time", start.toString(), "timezone", timeZone, "duration",
					Math.max(15, duration.toMinutes()), "settings", Map.of("join_before_host", true)))
			.retrieve()
			.body(MeetingResponse.class);
		return meeting.joinUrl();
	}

	record TokenResponse(@JsonProperty("access_token") String accessToken) {
	}

	record MeetingResponse(@JsonProperty("join_url") String joinUrl) {
	}

}
