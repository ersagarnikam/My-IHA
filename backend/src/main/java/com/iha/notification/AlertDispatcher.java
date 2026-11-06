package com.iha.notification;

import java.util.List;
import java.util.Objects;
import java.util.Set;

import com.iha.auth.AppUser;
import com.iha.auth.AppUserRepository;
import com.iha.auth.Role;
import com.iha.messaging.EmailBody;
import com.iha.messaging.EmailSender;
import com.iha.messaging.MessagingProperties;
import com.iha.messaging.SmsSender;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Email/SMS fan-out for notifications that ask for it (the old
 * {@code @iha/notifications} package). Runs after commit so a rolled-back
 * change never sends anything.
 */
@Component
class AlertDispatcher {

	/** Types that need the recipient to do something (the old channel config). */
	private static final Set<String> ACTION_REQUIRED = Set.of("document_requested", "additional_info_requested");

	private final AppUserRepository users;
	private final List<AlertPreferences> preferences;
	private final EmailSender email;
	private final SmsSender sms;
	private final MessagingProperties properties;

	AlertDispatcher(AppUserRepository users, List<AlertPreferences> preferences, EmailSender email, SmsSender sms,
			MessagingProperties properties) {
		this.users = users;
		this.preferences = preferences;
		this.email = email;
		this.sms = sms;
		this.properties = properties;
	}

	@TransactionalEventListener(fallbackExecution = true)
	void dispatch(AlertRequested event) {
		Notification n = event.notification();
		AlertPreferences.Channels channels = preferences.stream()
			.map(p -> p.channelsFor(n.getUserId()))
			.filter(Objects::nonNull)
			.findFirst()
			.orElse(new AlertPreferences.Channels(true, false, null));
		boolean actionRequired = ACTION_REQUIRED.contains(n.getType());
		users.findById(n.getUserId()).filter(user -> !user.isClosed()).ifPresent(user -> {
			if (channels.email()) {
				String subject = (actionRequired ? "Action required: " : "") + n.getTitle();
				email.send(user.getEmail(), subject, EmailBody.of(n.getTitle(), n.getMessage(), "View in portal",
						link(user, "notifications"), link(user, preferencesPage(user))));
			}
			if (channels.sms() && channels.phone() != null && !channels.phone().isBlank()) {
				sms.send(channels.phone(), (actionRequired ? "MTA: Action required — " : "MTA: ") + n.getMessage());
			}
		});
	}

	private String link(AppUser user, String page) {
		return properties.portalUrl() + "/" + user.getRole().name().toLowerCase() + "/" + page;
	}

	private static String preferencesPage(AppUser user) {
		return user.getRole() == Role.PATIENT ? "profile" : "account-settings";
	}

	record AlertRequested(Notification notification) {
	}

}
