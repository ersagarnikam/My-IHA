package com.iha.realtime;

import java.util.UUID;

import org.springframework.stereotype.Component;
import org.springframework.transaction.event.TransactionalEventListener;

/**
 * Publish one of these (via {@code ApplicationEventPublisher}) inside a
 * transaction to push {@code payload} to a user once the transaction commits —
 * so browsers never see data that was rolled back.
 */
public record RealtimeEvent(UUID userId, String type, Object payload) {

	@Component
	static class Forwarder {

		private final RealtimeHub hub;

		Forwarder(RealtimeHub hub) {
			this.hub = hub;
		}

		@TransactionalEventListener(fallbackExecution = true)
		void forward(RealtimeEvent event) {
			hub.publish(event.userId(), event.type(), event.payload());
		}

	}

}
