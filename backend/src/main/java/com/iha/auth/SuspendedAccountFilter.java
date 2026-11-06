package com.iha.auth;

import java.io.IOException;
import java.util.UUID;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;

import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.security.core.Authentication;
import org.springframework.security.core.context.SecurityContextHolder;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.web.filter.OncePerRequestFilter;

/**
 * Access tokens stay valid for hours, so suspension is checked on every request
 * as well as at sign-in. Added in SecurityConfig, not as a bean: as a bean it
 * would also run before authentication and never see the token.
 */
public class SuspendedAccountFilter extends OncePerRequestFilter {

	private final AppUserRepository users;

	public SuspendedAccountFilter(AppUserRepository users) {
		this.users = users;
	}

	@Override
	protected void doFilterInternal(HttpServletRequest request, HttpServletResponse response, FilterChain chain)
			throws ServletException, IOException {
		Authentication authentication = SecurityContextHolder.getContext().getAuthentication();
		if (authentication instanceof JwtAuthenticationToken token
				&& users.existsByIdAndSuspendedAtIsNotNull(UUID.fromString(token.getToken().getSubject()))) {
			response.setStatus(HttpStatus.UNAUTHORIZED.value());
			response.setContentType(MediaType.APPLICATION_PROBLEM_JSON_VALUE);
			response.getWriter()
				.write("{\"status\":401,\"code\":\"account_suspended\",\"detail\":\"This account is suspended.\"}");
			return;
		}
		chain.doFilter(request, response);
	}

}
