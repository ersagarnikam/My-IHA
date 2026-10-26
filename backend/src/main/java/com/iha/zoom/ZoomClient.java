package com.iha.zoom;

import java.time.Duration;
import java.time.Instant;

/** Creates consultation meetings (old {@code lib/zoom.ts}). */
public interface ZoomClient {

	/** @return the join URL, or null when no Zoom account is configured */
	/** @param timeZone IANA zone the meeting is shown in (the start is an instant either way) */
	String createMeeting(String topic, Instant start, Duration duration, String timeZone);

}
