package com.iha.common;

import java.time.ZoneId;
import java.util.LinkedHashMap;
import java.util.Map;

/**
 * The time zones doctors and hospitals can work in. Brisbane is the default
 * (and MTA's own zone for admin reporting and fee renewals).
 */
public final class AustralianTimeZones {

	public static final String DEFAULT = "Australia/Brisbane";

	/** IANA id → label, in display order. */
	public static final Map<String, String> SUPPORTED = new LinkedHashMap<>();

	static {
		SUPPORTED.put("Australia/Sydney", "Sydney / Canberra (NSW, ACT)");
		SUPPORTED.put("Australia/Melbourne", "Melbourne (VIC)");
		SUPPORTED.put("Australia/Brisbane", "Brisbane (QLD)");
		SUPPORTED.put("Australia/Adelaide", "Adelaide (SA)");
		SUPPORTED.put("Australia/Darwin", "Darwin (NT)");
		SUPPORTED.put("Australia/Perth", "Perth (WA)");
		SUPPORTED.put("Australia/Hobart", "Hobart (TAS)");
	}

	private AustralianTimeZones() {
	}

	/** The zone to store: {@link #DEFAULT} when none is given; rejects anything not in the list. */
	public static String valid(String zone) {
		if (zone == null || zone.isBlank()) {
			return DEFAULT;
		}
		if (!SUPPORTED.containsKey(zone)) {
			throw ApiException.badRequest("invalid_time_zone", "Choose an Australian time zone from the list.");
		}
		return zone;
	}

	public static ZoneId zone(String zone) {
		return ZoneId.of(zone == null || !SUPPORTED.containsKey(zone) ? DEFAULT : zone);
	}

}
