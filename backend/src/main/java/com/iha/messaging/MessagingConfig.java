package com.iha.messaging;

import java.time.Duration;

import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.concurrent.ThreadPoolTaskExecutor;

/** Messages go out on their own threads, so a slow provider never holds up a request or a transaction. */
@Configuration
@EnableAsync
class MessagingConfig {

	static final String EXECUTOR = "messagingExecutor";

	/** Not a default candidate: Spring Boot's own task executor must stay in place for everything else. */
	@Bean(name = EXECUTOR, defaultCandidate = false)
	ThreadPoolTaskExecutor messagingExecutor() {
		ThreadPoolTaskExecutor executor = new ThreadPoolTaskExecutor();
		executor.setThreadNamePrefix("messaging-");
		executor.setCorePoolSize(2);
		executor.setMaxPoolSize(4);
		executor.setQueueCapacity(500);
		executor.setWaitForTasksToCompleteOnShutdown(true);
		executor.setAwaitTerminationSeconds(20);
		return executor;
	}

	static SimpleClientHttpRequestFactory requestFactory() {
		SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
		factory.setConnectTimeout(Duration.ofSeconds(5));
		factory.setReadTimeout(Duration.ofSeconds(15));
		return factory;
	}

}
