package com.iha.dev;

import java.sql.Timestamp;
import java.time.Duration;
import java.time.Instant;
import java.util.UUID;

import org.springframework.jdbc.core.JdbcTemplate;

/** DEV ONLY. Moves recorded times into the past so time-gated steps can be tried immediately. */
final class DevTime {

	private DevTime() {
	}

	/** Shifts the consultation's chosen slot so it started an hour ago (it has "taken place"). */
	static void consultationHeld(JdbcTemplate jdbc, UUID requestId) {
		UUID slotId = jdbc.queryForObject("select selected_slot_id from consultation_requests where id = ?", UUID.class,
				requestId);
		if (slotId == null) {
			throw new IllegalStateException("The patient hasn't chosen a time yet.");
		}
		Instant start = Instant.now().minus(Duration.ofHours(1));
		jdbc.update("update consultation_slots set slot_time = ?, slot_end_time = ? where id = ?", Timestamp.from(start),
				Timestamp.from(start.plus(Duration.ofMinutes(30))), slotId);
	}

}
