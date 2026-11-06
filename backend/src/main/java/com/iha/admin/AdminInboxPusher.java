package com.iha.admin;

import com.iha.auth.AppUserRepository;
import com.iha.auth.Role;
import com.iha.realtime.AdminInboxEvent;
import com.iha.realtime.RealtimeHub;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

/** Tells every signed-in admin the inbox changed, after the message is committed. */
@Component
class AdminInboxPusher {

	private final AppUserRepository users;
	private final RealtimeHub hub;

	AdminInboxPusher(AppUserRepository users, RealtimeHub hub) {
		this.users = users;
		this.hub = hub;
	}

	@TransactionalEventListener(fallbackExecution = true)
	void push(AdminInboxEvent event) {
		users.findByRole(Role.ADMIN).forEach(admin -> hub.publish(admin.getId(), "admin_inbox", event));
	}

}
