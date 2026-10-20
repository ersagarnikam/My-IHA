package com.iha.auth;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.security.SecureRandom;
import java.time.Instant;
import java.util.HexFormat;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import com.iha.audit.AuditService;
import com.iha.common.ApiException;

import org.springframework.context.ApplicationEventPublisher;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Propagation;
import org.springframework.transaction.annotation.Transactional;

/**
 * Accounts, email verification, sign-in and passwords (replaces Supabase Auth).
 * Role profiles (patients, doctors, …) are created by their own modules on top
 * of {@link #createAccount}.
 */
@Service
public class AuthService {

	private final AppUserRepository users;
	private final EmailVerificationCodeRepository codes;
	private final PasswordEncoder passwordEncoder;
	private final TokenService tokenService;
	private final VerificationCodeSender codeSender;
	private final VerificationProperties verificationProperties;
	private final AuditService audit;
	private final ApplicationEventPublisher events;
	private final List<SignInGuard> signInGuards;
	private final SecureRandom random = new SecureRandom();

	public AuthService(AppUserRepository users, EmailVerificationCodeRepository codes, PasswordEncoder passwordEncoder,
			TokenService tokenService, VerificationCodeSender codeSender, VerificationProperties verificationProperties,
			AuditService audit, ApplicationEventPublisher events, List<SignInGuard> signInGuards) {
		this.users = users;
		this.codes = codes;
		this.passwordEncoder = passwordEncoder;
		this.tokenService = tokenService;
		this.codeSender = codeSender;
		this.verificationProperties = verificationProperties;
		this.audit = audit;
		this.events = events;
		this.signInGuards = signInGuards;
	}

	/** Creates an unverified account and sends it a verification code. Joins the caller's transaction. */
	@Transactional(propagation = Propagation.MANDATORY)
	public AppUser createAccount(String email, String password, Role role) {
		String normalized = normalize(email);
		if (users.existsByEmail(normalized)) {
			throw ApiException.conflict("email_taken", "An account with this email already exists.");
		}
		AppUser user = users.save(new AppUser(normalized, passwordEncoder.encode(password), role));
		issueCode(user, EmailVerificationCode.VERIFY_EMAIL);
		return user;
	}

	@Transactional(noRollbackFor = ApiException.class)
	public AuthResult verifyEmail(String email, String code) {
		AppUser user = users.findByEmail(normalize(email)).orElseThrow(AuthService::invalidCode);
		if (user.isEmailVerified()) {
			throw ApiException.badRequest("already_verified", "This email is already verified. Please sign in.");
		}
		consumeCode(user, EmailVerificationCode.VERIFY_EMAIL, code);
		user.markEmailVerified();
		audit.record(user.getId(), user.getEmail(), app(user), "auth.email_verified", "user", user.getId(), Map.of());
		events.publishEvent(new EmailVerifiedEvent(user));
		return issue(user);
	}

	/** Silently does nothing for unknown or already-verified emails, so it can't be used to probe accounts. */
	@Transactional
	public void resendCode(String email) {
		users.findByEmail(normalize(email))
			.filter(user -> !user.isEmailVerified())
			.ifPresent(user -> issueCode(user, EmailVerificationCode.VERIFY_EMAIL));
	}

	@Transactional
	public AuthResult login(String email, String password) {
		AppUser user = users.findByEmail(normalize(email))
			.filter(u -> passwordEncoder.matches(password, u.getPasswordHash()))
			.orElseThrow(() -> ApiException.unauthorized("invalid_credentials", "Incorrect email or password."));
		if (!user.isEmailVerified()) {
			throw ApiException.forbidden("email_not_verified", "Please verify your email before signing in.");
		}
		signInGuards.forEach(guard -> guard.check(user));
		audit.record(user.getId(), user.getEmail(), app(user), "auth.login", "user", user.getId(), Map.of());
		return issue(user);
	}

	/** Always succeeds from the caller's point of view (no account probing). */
	@Transactional
	public void requestPasswordReset(String email) {
		users.findByEmail(normalize(email)).ifPresent(user -> {
			issueCode(user, EmailVerificationCode.RESET_PASSWORD);
			audit.record(user.getId(), user.getEmail(), app(user), "auth.password_reset_requested", "user",
					user.getId(), Map.of());
		});
	}

	@Transactional(noRollbackFor = ApiException.class)
	public void resetPassword(String email, String code, String newPassword) {
		AppUser user = users.findByEmail(normalize(email)).orElseThrow(AuthService::invalidCode);
		consumeCode(user, EmailVerificationCode.RESET_PASSWORD, code);
		user.changePassword(passwordEncoder.encode(newPassword));
		// Receiving the code proves control of the inbox, so it also verifies the email.
		user.markEmailVerified();
		audit.record(user.getId(), user.getEmail(), app(user), "auth.password_reset", "user", user.getId(), Map.of());
	}

	@Transactional
	public void changePassword(CurrentUser current, String currentPassword, String newPassword) {
		AppUser user = getUser(current);
		if (!passwordEncoder.matches(currentPassword, user.getPasswordHash())) {
			throw ApiException.badRequest("invalid_current_password", "Your current password is incorrect.");
		}
		user.changePassword(passwordEncoder.encode(newPassword));
		audit.record(user.getId(), user.getEmail(), app(user), "auth.password_changed", "user", user.getId(),
				Map.of());
	}

	@Transactional(readOnly = true)
	public AppUser getUser(CurrentUser current) {
		return users.findById(current.id())
			.orElseThrow(() -> ApiException.unauthorized("account_missing", "This account no longer exists."));
	}

	private void consumeCode(AppUser user, String purpose, String code) {
		EmailVerificationCode stored = codes
			.findFirstByUserIdAndPurposeAndConsumedAtIsNullOrderByCreatedAtDesc(user.getId(), purpose)
			.filter(c -> c.isUsable(Instant.now(), verificationProperties.maxAttempts()))
			.orElseThrow(() -> ApiException.badRequest("code_expired", "This code has expired. Request a new one."));
		if (!MessageDigest.isEqual(hash(code).getBytes(StandardCharsets.UTF_8),
				stored.getCodeHash().getBytes(StandardCharsets.UTF_8))) {
			// Persisted despite the exception (noRollbackFor), so attempts really are capped.
			stored.recordFailedAttempt();
			throw invalidCode();
		}
		stored.consume();
	}

	private void issueCode(AppUser user, String purpose) {
		codes.consumeAllForUser(user.getId(), purpose, Instant.now());
		String code = "%06d".formatted(random.nextInt(1_000_000));
		codes.save(new EmailVerificationCode(user.getId(), purpose, hash(code),
				Instant.now().plus(verificationProperties.codeTtl())));
		codeSender.send(user.getEmail(), purpose, code);
	}

	private AuthResult issue(AppUser user) {
		TokenService.IssuedToken token = tokenService.issue(user);
		return new AuthResult(token.value(), token.expiresAt(), user);
	}

	private static ApiException invalidCode() {
		return ApiException.badRequest("invalid_code", "That code is incorrect.");
	}

	private static String app(AppUser user) {
		return user.getRole().name().toLowerCase(Locale.ROOT);
	}

	static String normalize(String email) {
		return email.trim().toLowerCase(Locale.ROOT);
	}

	private static String hash(String code) {
		try {
			MessageDigest digest = MessageDigest.getInstance("SHA-256");
			return HexFormat.of().formatHex(digest.digest(code.trim().getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException ex) {
			throw new IllegalStateException(ex);
		}
	}

	public record AuthResult(String accessToken, Instant expiresAt, AppUser user) {
	}

}
