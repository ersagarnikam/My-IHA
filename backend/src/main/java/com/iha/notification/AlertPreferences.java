package com.iha.notification;

import java.util.UUID;

/**
 * Implemented by each role module that stores email/SMS preferences (patients,
 * doctors, …). Return null for users the module doesn't own.
 */
public interface AlertPreferences {

	Channels channelsFor(UUID userId);

	record Channels(boolean email, boolean sms, String phone) {
	}

}
