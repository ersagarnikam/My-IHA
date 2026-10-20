package com.iha.storage;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("iha.storage")
public record StorageProperties(String root) {
}
