package com.iha.patient;

import java.util.UUID;

import com.iha.auth.AppUser;
import com.iha.auth.EmailVerifiedEvent;
import com.iha.auth.Role;
import com.iha.auth.SignInGuard;
import com.iha.common.ApiException;
import com.iha.notification.AlertPreferences;
import com.iha.notification.NotificationService;

import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/** Patient-specific reactions to account events, and the patient's alert preferences. */
@Component
class PatientAccountHooks implements SignInGuard, AlertPreferences {

	private final PatientRepository patients;
	private final NotificationService notifications;

	PatientAccountHooks(PatientRepository patients, NotificationService notifications) {
		this.patients = patients;
		this.notifications = notifications;
	}

	/** Replaces the middleware soft-delete check: deleted patients can't sign in. */
	@Override
	public void check(AppUser user) {
		if (user.getRole() == Role.PATIENT && patients.findByUserId(user.getId()).map(Patient::isDeleted).orElse(false)) {
			throw ApiException.forbidden("account_deleted", "This account has been deleted.");
		}
	}

	@EventListener
	void welcome(EmailVerifiedEvent event) {
		if (event.user().getRole() == Role.PATIENT) {
			notifications.notify(event.user().getId(), "welcome", "Welcome to MTA",
					"Your email is verified. Welcome to MTA — let’s get your medical journey started.", null);
		}
	}

	@Override
	public Channels channelsFor(UUID userId) {
		return patients.findByUserId(userId)
			.map(p -> new Channels(p.isEmailNotificationsEnabled(), p.isSmsNotificationsEnabled(), p.getPhone()))
			.orElse(null);
	}

}
