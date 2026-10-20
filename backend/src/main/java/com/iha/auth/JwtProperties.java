package com.iha.auth;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** @param secret HMAC-SHA256 key material, at least 32 bytes */
@ConfigurationProperties("iha.jwt")
public record JwtProperties(String secret, Duration ttl) {
}
