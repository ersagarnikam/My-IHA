package com.iha.zoom;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** Zoom Server-to-Server OAuth app credentials. Leave blank to skip meeting creation. */
@ConfigurationProperties("iha.zoom")
public record ZoomProperties(String accountId, String clientId, String clientSecret) {

	public boolean isConfigured() {
		return notBlank(accountId) && notBlank(clientId) && notBlank(clientSecret);
	}

	private static boolean notBlank(String value) {
		return value != null && !value.isBlank();
	}

}
