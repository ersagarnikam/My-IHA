package com.iha.realtime;

import java.io.IOException;
import java.time.Duration;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArraySet;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.MediaType;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * Pushes events to signed-in browsers over server-sent events, replacing
 * Supabase Realtime. Each user may have several open streams (tabs).
 *
 * <p>Connections live in this JVM only; running more than one API instance
 * needs a shared broker (e.g. Postgres LISTEN/NOTIFY or Redis) behind
 * {@link #publish}.
 */
@Component
public class RealtimeHub {

	private static final Logger log = LoggerFactory.getLogger(RealtimeHub.class);
	private static final Duration STREAM_TIMEOUT = Duration.ofMinutes(30);

	private final Map<UUID, Set<SseEmitter>> streams = new ConcurrentHashMap<>();

	public SseEmitter open(UUID userId) {
		SseEmitter emitter = new SseEmitter(STREAM_TIMEOUT.toMillis());
		Set<SseEmitter> userStreams = streams.computeIfAbsent(userId, id -> new CopyOnWriteArraySet<>());
		userStreams.add(emitter);
		Runnable remove = () -> userStreams.remove(emitter);
		emitter.onCompletion(remove);
		emitter.onTimeout(remove);
		emitter.onError(error -> remove.run());
		send(emitter, "ready", Map.of());
		return emitter;
	}

	/** Sends {@code payload} (serialised as JSON) as event {@code type} to every stream of the user. */
	public void publish(UUID userId, String type, Object payload) {
		Set<SseEmitter> userStreams = streams.get(userId);
		if (userStreams == null) {
			return;
		}
		for (SseEmitter emitter : List.copyOf(userStreams)) {
			if (!send(emitter, type, payload)) {
				userStreams.remove(emitter);
			}
		}
	}

	/** Keeps idle connections open through proxies. */
	@Scheduled(fixedDelay = 25_000)
	void heartbeat() {
		streams.forEach((userId, userStreams) -> List.copyOf(userStreams).forEach(emitter -> {
			try {
				emitter.send(SseEmitter.event().comment("ping"));
			}
			catch (IOException | IllegalStateException ex) {
				userStreams.remove(emitter);
			}
		}));
	}

	private static boolean send(SseEmitter emitter, String type, Object payload) {
		try {
			emitter.send(SseEmitter.event().name(type).data(payload, MediaType.APPLICATION_JSON));
			return true;
		}
		catch (IOException | IllegalStateException ex) {
			log.debug("Dropping closed realtime stream: {}", ex.getMessage());
			return false;
		}
	}

}
