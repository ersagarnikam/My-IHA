package com.iha.auth;

import java.util.UUID;

import org.springframework.security.oauth2.jwt.Jwt;

/** The authenticated caller, read from a validated access token. */
public record CurrentUser(UUID id, String email, Role role) {

	public static CurrentUser from(Jwt jwt) {
		return new CurrentUser(UUID.fromString(jwt.getSubject()), jwt.getClaimAsString(TokenService.EMAIL_CLAIM),
				Role.valueOf(jwt.getClaimAsString(TokenService.ROLE_CLAIM)));
	}

}
