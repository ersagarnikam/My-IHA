package com.iha.notification;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.verify;

import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;

import com.iha.auth.AppUser;
import com.iha.auth.AppUserRepository;
import com.iha.auth.Role;
import com.iha.auth.VerificationCodeSender;
import com.iha.messaging.EmailBody;
import com.iha.messaging.EmailSender;
import com.iha.messaging.SmsSender;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

@SpringBootTest
class AlertDeliveryTests {

	@Autowired
	NotificationService notifications;

	@Autowired
	AppUserRepository users;

	@Autowired
	VerificationCodeSender codes;

	@MockitoBean
	EmailSender email;

	@MockitoBean
	SmsSender sms;

	@Autowired
	TestPreferences preferences;

	@TestConfiguration
	static class Config {

		@Bean
		TestPreferences testPreferences() {
			return new TestPreferences();
		}

	}

	/** Answers for the users of this test; the real modules return null for them. */
	static class TestPreferences implements AlertPreferences {

		final Map<UUID, Channels> channels = new ConcurrentHashMap<>();

		@Override
		public Channels channelsFor(UUID userId) {
			return channels.get(userId);
		}

	}

	private AppUser user;

	@BeforeEach
	void setUp() {
		reset(email, sms);
		user = users.save(new AppUser("alerts-" + UUID.randomUUID() + "@example.com", "x", Role.PATIENT));
	}

	private void channels(boolean byEmail, boolean bySms) {
		preferences.channels.put(user.getId(), new AlertPreferences.Channels(byEmail, bySms, "+61412345678"));
	}

	@Test
	void alertsFollowThePreferencesAndLinkToThePortal() {
		channels(true, true);

		notifications.notifyWithAlert(user.getId(), "visa_status_updated", "Visa approved", "Good news.", null);

		ArgumentCaptor<EmailBody> body = ArgumentCaptor.forClass(EmailBody.class);
		verify(email).send(eq(user.getEmail()), eq("Visa approved"), body.capture());
		assertThat(body.getValue().text()).contains("Good news.", "/patient/notifications", "/patient/profile");
		verify(sms).send("+61412345678", "MTA: Good news.");
	}

	@Test
	void documentRequestsAreMarkedActionRequired() {
		channels(true, true);

		notifications.notifyWithAlert(user.getId(), "document_requested", "Document needed", "Upload it.", null);

		verify(email).send(eq(user.getEmail()), eq("Action required: Document needed"), any());
		verify(sms).send("+61412345678", "MTA: Action required — Upload it.");
	}

	@Test
	void channelsTurnedOffStayQuiet() {
		channels(false, false);

		notifications.notifyWithAlert(user.getId(), "visa_status_updated", "Visa approved", "Good news.", null);

		verify(email, never()).send(anyString(), anyString(), any());
		verify(sms, never()).send(anyString(), anyString());
	}

	@Test
	void inPortalOnlyNotificationsSendNothing() {
		channels(true, true);

		notifications.notify(user.getId(), "visa_status_updated", "Visa approved", "Good news.", null);

		verify(email, never()).send(anyString(), anyString(), any());
	}

	@Test
	void closedAccountsAreNeverContacted() {
		channels(true, true);
		user.close("closed+" + user.getId() + "@deleted.invalid", "x");
		users.save(user);

		notifications.notifyWithAlert(user.getId(), "visa_status_updated", "Visa approved", "Good news.", null);

		verify(email, never()).send(anyString(), anyString(), any());
		verify(sms, never()).send(anyString(), anyString());
	}

	@Test
	void verificationCodesAreEmailed() {
		codes.send(user.getEmail(), "verify_email", "123456");

		ArgumentCaptor<EmailBody> body = ArgumentCaptor.forClass(EmailBody.class);
		verify(email).send(eq(user.getEmail()), eq("Verify your email: 123456"), body.capture());
		assertThat(body.getValue().text()).contains("123456", "15 minutes");
	}

}
