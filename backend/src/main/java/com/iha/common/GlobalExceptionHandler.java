package com.iha.common;

import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.HttpStatus;
import org.springframework.http.ProblemDetail;
import org.springframework.security.access.AccessDeniedException;
import org.springframework.security.core.AuthenticationException;
import org.springframework.web.ErrorResponse;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.context.request.async.AsyncRequestNotUsableException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;

/**
 * Renders every error as RFC 9457 problem details with an extra {@code code}
 * property (and {@code fieldErrors} for validation failures).
 */
@RestControllerAdvice
public class GlobalExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

	@ExceptionHandler(ApiException.class)
	public ProblemDetail handleApi(ApiException ex) {
		return problem(ex.getStatus(), ex.getCode(), ex.getMessage());
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	public ProblemDetail handleValidation(MethodArgumentNotValidException ex) {
		Map<String, String> fieldErrors = new LinkedHashMap<>();
		ex.getBindingResult().getFieldErrors()
			.forEach(error -> fieldErrors.putIfAbsent(error.getField(), error.getDefaultMessage()));
		ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "validation_failed",
				"Some fields are invalid.");
		problem.setProperty("fieldErrors", fieldErrors);
		return problem;
	}

	@ExceptionHandler(FieldValidationException.class)
	public ProblemDetail handleFieldValidation(FieldValidationException ex) {
		ProblemDetail problem = problem(HttpStatus.BAD_REQUEST, "validation_failed", ex.getMessage());
		problem.setProperty("fieldErrors", ex.getFieldErrors());
		return problem;
	}

	@ExceptionHandler(MaxUploadSizeExceededException.class)
	public ProblemDetail handleUploadSize(MaxUploadSizeExceededException ex) {
		return problem(HttpStatus.PAYLOAD_TOO_LARGE, "file_too_large", "The upload is too large.");
	}

	/** A browser closed a live-update stream (tab closed, navigation). Nothing to report or send. */
	@ExceptionHandler(AsyncRequestNotUsableException.class)
	public void handleClientGone(AsyncRequestNotUsableException ex) {
		log.debug("Client disconnected: {}", ex.getMessage());
	}

	@ExceptionHandler(Exception.class)
	public ProblemDetail handleUnexpected(Exception ex) throws Exception {
		// Let Spring render its own framework exceptions (404 route, 405, 403 from
		// method security, …) with their proper status codes.
		if (ex instanceof ErrorResponse
				|| ex instanceof AccessDeniedException
				|| ex instanceof AuthenticationException) {
			throw ex;
		}
		log.error("Unhandled exception", ex);
		return problem(HttpStatus.INTERNAL_SERVER_ERROR, "internal_error",
				"Something went wrong. Please try again.");
	}

	private static ProblemDetail problem(HttpStatus status, String code, String message) {
		ProblemDetail problem = ProblemDetail.forStatusAndDetail(status, message);
		problem.setProperty("code", code);
		return problem;
	}

}
