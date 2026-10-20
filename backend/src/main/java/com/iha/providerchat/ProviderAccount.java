package com.iha.providerchat;

import java.util.UUID;

/**
 * Which provider row a thread belongs to, plus the signed-in user behind it.
 *
 * @param type {@code doctor}, {@code hospital} or {@code lawyer} (also the message sender type)
 */
public record ProviderAccount(String type, UUID id, UUID userId) {

	public static final String DOCTOR = "doctor";
	public static final String HOSPITAL = "hospital";
	public static final String LAWYER = "lawyer";

}
