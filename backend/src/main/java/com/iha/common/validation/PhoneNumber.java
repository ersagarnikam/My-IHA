package com.iha.common.validation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import com.google.i18n.phonenumbers.NumberParseException;
import com.google.i18n.phonenumbers.PhoneNumberUtil;
import jakarta.validation.Constraint;
import jakarta.validation.ConstraintValidator;
import jakarta.validation.ConstraintValidatorContext;
import jakarta.validation.Payload;

/**
 * An international phone number ({@code +<country code>…}), checked with
 * libphonenumber like the old {@code isValidPhone}. Null/blank passes; combine
 * with {@code @NotBlank} when required.
 */
@Documented
@Constraint(validatedBy = PhoneNumber.Validator.class)
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface PhoneNumber {

	String message() default "Enter a valid phone number.";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

	class Validator implements ConstraintValidator<PhoneNumber, String> {

		@Override
		public boolean isValid(String value, ConstraintValidatorContext context) {
			return value == null || value.isBlank() || isValid(value);
		}

		public static boolean isValid(String value) {
			PhoneNumberUtil util = PhoneNumberUtil.getInstance();
			try {
				return util.isValidNumber(util.parse(value, "AU"));
			}
			catch (NumberParseException ex) {
				return false;
			}
		}

	}

}
