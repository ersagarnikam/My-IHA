package com.iha.common;

import java.util.Map;

/**
 * Validation that can't be expressed as annotations (cross-field rules).
 * Rendered exactly like a Bean Validation failure: {@code validation_failed}
 * with {@code fieldErrors}.
 */
public class FieldValidationException extends RuntimeException {

	private final Map<String, String> fieldErrors;

	public FieldValidationException(Map<String, String> fieldErrors) {
		super("Some fields are invalid.");
		this.fieldErrors = Map.copyOf(fieldErrors);
	}

	public Map<String, String> getFieldErrors() {
		return fieldErrors;
	}

}
