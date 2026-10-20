package com.iha.auth;

import java.time.Instant;
import java.util.UUID;

import com.iha.common.validation.StrongPassword;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;

public final class AuthDtos {

	private AuthDtos() {
	}

	public record LoginRequest(@NotBlank @Email String email, @NotBlank String password) {
	}

	public record VerifyEmailRequest(@NotBlank @Email String email,
			@NotBlank @Pattern(regexp = "\\d{6}", message = "Enter the 6-digit code") String code) {
	}

	public record EmailRequest(@NotBlank @Email String email) {
	}

	public record ResetPasswordRequest(@NotBlank @Email String email,
			@NotBlank @Pattern(regexp = "\\d{6}", message = "Enter the 6-digit code") String code,
			@StrongPassword String password) {
	}

	public record ChangePasswordRequest(@NotBlank String currentPassword, @StrongPassword String newPassword) {
	}

	public record UserResponse(UUID id, String email, Role role) {

		static UserResponse of(AppUser user) {
			return new UserResponse(user.getId(), user.getEmail(), user.getRole());
		}

	}

	public record AuthResponse(String accessToken, Instant expiresAt, UserResponse user) {

		public static AuthResponse of(AuthService.AuthResult result) {
			return new AuthResponse(result.accessToken(), result.expiresAt(), UserResponse.of(result.user()));
		}

	}

}
