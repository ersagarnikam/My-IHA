package com.iha.common.validation;

import java.lang.annotation.Documented;
import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;

import jakarta.validation.Constraint;
import jakarta.validation.Payload;
import jakarta.validation.ReportAsSingleViolation;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/** The account password rule from the old {@code passwordField}: 8+ characters, an uppercase letter and a digit. */
@Documented
@NotBlank
@Size(min = 8, max = 128)
@Pattern(regexp = "^(?=.*[A-Z])(?=.*[0-9]).*$")
@ReportAsSingleViolation
@Constraint(validatedBy = {})
@Target({ ElementType.FIELD, ElementType.PARAMETER, ElementType.RECORD_COMPONENT })
@Retention(RetentionPolicy.RUNTIME)
public @interface StrongPassword {

	String message() default "Password must be at least 8 characters and include an uppercase letter and a number";

	Class<?>[] groups() default {};

	Class<? extends Payload>[] payload() default {};

}
