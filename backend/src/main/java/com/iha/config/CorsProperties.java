package com.iha.config;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("iha.cors")
public record CorsProperties(List<String> allowedOrigins) {
}
