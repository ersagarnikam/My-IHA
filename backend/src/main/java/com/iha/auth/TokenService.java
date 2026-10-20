package com.iha.auth;

import java.time.Instant;

import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.stereotype.Service;

@Service
public class TokenService {

	public static final String ISSUER = "iha-api";
	static final String ROLE_CLAIM = "role";
	static final String EMAIL_CLAIM = "email";

	private final JwtEncoder encoder;
	private final JwtProperties properties;

	public TokenService(JwtEncoder encoder, JwtProperties properties) {
		this.encoder = encoder;
		this.properties = properties;
	}

	public IssuedToken issue(AppUser user) {
		Instant now = Instant.now();
		Instant expiresAt = now.plus(properties.ttl());
		JwtClaimsSet claims = JwtClaimsSet.builder()
			.issuer(ISSUER)
			.subject(user.getId().toString())
			.issuedAt(now)
			.expiresAt(expiresAt)
			.claim(EMAIL_CLAIM, user.getEmail())
			.claim(ROLE_CLAIM, user.getRole().name())
			.build();
		JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
		String token = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
		return new IssuedToken(token, expiresAt);
	}

	public record IssuedToken(String value, Instant expiresAt) {
	}

}
