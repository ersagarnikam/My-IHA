package com.iha.common;

import org.springframework.http.HttpStatus;

/**
 * An error that maps directly to an HTTP response. {@code code} is a stable,
 * machine-readable identifier the frontend can switch on; {@code message} is
 * safe to show to the user.
 */
public class ApiException extends RuntimeException {

	private final HttpStatus status;
	private final String code;

	public ApiException(HttpStatus status, String code, String message) {
		super(message);
		this.status = status;
		this.code = code;
	}

	public HttpStatus getStatus() {
		return status;
	}

	public String getCode() {
		return code;
	}

	public static ApiException badRequest(String code, String message) {
		return new ApiException(HttpStatus.BAD_REQUEST, code, message);
	}

	public static ApiException unauthorized(String code, String message) {
		return new ApiException(HttpStatus.UNAUTHORIZED, code, message);
	}

	public static ApiException forbidden(String code, String message) {
		return new ApiException(HttpStatus.FORBIDDEN, code, message);
	}

	/** Also used for "exists but not yours", so callers can't probe for other users' records. */
	public static ApiException notFound(String message) {
		return new ApiException(HttpStatus.NOT_FOUND, "not_found", message);
	}

	public static ApiException conflict(String code, String message) {
		return new ApiException(HttpStatus.CONFLICT, code, message);
	}

}
