package com.iha.notification;

import java.util.List;
import java.util.Objects;

import com.iha.auth.AppUserRepository;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Email/SMS fan-out for notifications that ask for it (the old
 * {@code @iha/notifications} package). No provider is wired up yet, so alerts
 * are logged; plug Resend/Twilio clients in here. Runs after commit so a
 * rolled-back change never sends anything.
 */
@Component
class AlertDispatcher {

	private static final Logger log = LoggerFactory.getLogger(AlertDispatcher.class);

	private final AppUserRepository users;
	private final List<AlertPreferences> preferences;

	AlertDispatcher(AppUserRepository users, List<AlertPreferences> preferences) {
		this.users = users;
		this.preferences = preferences;
	}

	@TransactionalEventListener(fallbackExecution = true)
	void dispatch(AlertRequested event) {
		Notification n = event.notification();
		AlertPreferences.Channels channels = preferences.stream()
			.map(p -> p.channelsFor(n.getUserId()))
			.filter(Objects::nonNull)
			.findFirst()
			.orElse(new AlertPreferences.Channels(true, false, null));
		users.findById(n.getUserId()).ifPresent(user -> {
			if (channels.email()) {
				log.info("[email → {}] {}: {}", user.getEmail(), n.getTitle(), n.getMessage());
			}
			if (channels.sms() && channels.phone() != null) {
				log.info("[sms → {}] {}", channels.phone(), n.getMessage());
			}
		});
	}

	record AlertRequested(Notification notification) {
	}

}
