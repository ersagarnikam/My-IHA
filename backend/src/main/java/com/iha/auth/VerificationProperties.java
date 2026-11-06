package com.iha.auth;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** @param logCodes also write codes to the log (development and test environments only) */
@ConfigurationProperties("iha.verification")
public record VerificationProperties(Duration codeTtl, int maxAttempts, boolean logCodes) {
}
