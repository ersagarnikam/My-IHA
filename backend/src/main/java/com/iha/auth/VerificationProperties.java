package com.iha.auth;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** @param logCodes write codes to the log (development only; no email provider is wired up yet) */
@ConfigurationProperties("iha.verification")
public record VerificationProperties(Duration codeTtl, int maxAttempts, boolean logCodes) {
}
