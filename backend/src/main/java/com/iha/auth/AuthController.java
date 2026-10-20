package com.iha.auth;

import com.iha.auth.AuthDtos.AuthResponse;
import com.iha.auth.AuthDtos.ChangePasswordRequest;
import com.iha.auth.AuthDtos.EmailRequest;
import com.iha.auth.AuthDtos.LoginRequest;
import com.iha.auth.AuthDtos.ResetPasswordRequest;
import com.iha.auth.AuthDtos.UserResponse;
import com.iha.auth.AuthDtos.VerifyEmailRequest;
import jakarta.validation.Valid;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** Role-neutral auth endpoints. Registration lives with each role (e.g. {@code /api/auth/register/patient}). */
@RestController
@RequestMapping("/api/auth")
public class AuthController {

	private final AuthService authService;

	public AuthController(AuthService authService) {
		this.authService = authService;
	}

	@PostMapping("/login")
	public AuthResponse login(@Valid @RequestBody LoginRequest request) {
		return AuthResponse.of(authService.login(request.email(), request.password()));
	}

	@PostMapping("/verify")
	public AuthResponse verify(@Valid @RequestBody VerifyEmailRequest request) {
		return AuthResponse.of(authService.verifyEmail(request.email(), request.code()));
	}

	@PostMapping("/resend-code")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void resendCode(@Valid @RequestBody EmailRequest request) {
		authService.resendCode(request.email());
	}

	@PostMapping("/forgot-password")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void forgotPassword(@Valid @RequestBody EmailRequest request) {
		authService.requestPasswordReset(request.email());
	}

	@PostMapping("/reset-password")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void resetPassword(@Valid @RequestBody ResetPasswordRequest request) {
		authService.resetPassword(request.email(), request.code(), request.password());
	}

	@GetMapping("/me")
	public UserResponse me(@AuthenticationPrincipal Jwt jwt) {
		return UserResponse.of(authService.getUser(CurrentUser.from(jwt)));
	}

	@PutMapping("/password")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	public void changePassword(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ChangePasswordRequest request) {
		authService.changePassword(CurrentUser.from(jwt), request.currentPassword(), request.newPassword());
	}

}
