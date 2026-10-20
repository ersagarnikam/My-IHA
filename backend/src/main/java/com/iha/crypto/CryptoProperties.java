package com.iha.crypto;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** @param piiKey Base64-encoded 32-byte AES key. */
@ConfigurationProperties("iha.crypto")
public record CryptoProperties(String piiKey) {
}
