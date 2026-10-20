package com.iha.realtime;

import com.iha.auth.CurrentUser;

import org.springframework.http.MediaType;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RestController;
import org.springframework.web.servlet.mvc.method.annotation.SseEmitter;

/**
 * One event stream per signed-in tab. The browser reads it with fetch (not
 * EventSource) so it can send the bearer token.
 */
@RestController
public class RealtimeController {

	private final RealtimeHub hub;

	public RealtimeController(RealtimeHub hub) {
		this.hub = hub;
	}

	@GetMapping(path = "/api/realtime", produces = MediaType.TEXT_EVENT_STREAM_VALUE)
	public SseEmitter stream(@AuthenticationPrincipal Jwt jwt) {
		return hub.open(CurrentUser.from(jwt).id());
	}

}
