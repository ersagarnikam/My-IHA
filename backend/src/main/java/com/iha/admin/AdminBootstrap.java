package com.iha.admin;

import java.util.Map;

import com.iha.audit.AuditService;
import com.iha.auth.AppUser;
import com.iha.auth.AppUserRepository;
import com.iha.auth.Role;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Admins can't sign themselves up (the old portal's open sign-up was a known
 * hole). The first admin comes from {@code IHA_ADMIN_EMAIL} /
 * {@code IHA_ADMIN_PASSWORD}: created on startup if that email doesn't exist
 * yet. Nothing happens when they're unset.
 */
@Component
class AdminBootstrap implements ApplicationRunner {

	private static final Logger log = LoggerFactory.getLogger(AdminBootstrap.class);

	private final AppUserRepository users;
	private final PasswordEncoder passwordEncoder;
	private final AuditService audit;
	private final String email;
	private final String password;

	AdminBootstrap(AppUserRepository users, PasswordEncoder passwordEncoder, AuditService audit,
			@Value("${iha.admin.bootstrap-email:}") String email,
			@Value("${iha.admin.bootstrap-password:}") String password) {
		this.users = users;
		this.passwordEncoder = passwordEncoder;
		this.audit = audit;
		this.email = email == null ? "" : email.trim().toLowerCase(java.util.Locale.ROOT);
		this.password = password;
	}

	@Override
	@Transactional
	public void run(ApplicationArguments args) {
		if (email.isEmpty() || users.existsByEmail(email)) {
			return;
		}
		if (password == null || password.length() < 12) {
			log.warn("IHA_ADMIN_EMAIL is set but IHA_ADMIN_PASSWORD is missing or shorter than 12 characters; "
					+ "no admin account was created.");
			return;
		}
		AppUser admin = new AppUser(email, passwordEncoder.encode(password), Role.ADMIN);
		admin.markEmailVerified();
		users.save(admin);
		audit.record(admin.getId(), email, "admin", "auth.admin_bootstrapped", "user", admin.getId(), Map.of());
		log.info("Created the first admin account {}", email);
	}

}
