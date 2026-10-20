package com.iha.common;

/**
 * An enum persisted (and serialised to JSON) as a lowercase snake_case string,
 * matching the text values used by the original schema's CHECK constraints.
 */
public interface DbEnum {

	String dbValue();

	static <E extends Enum<E> & DbEnum> E fromDbValue(Class<E> type, String value) {
		if (value == null) {
			return null;
		}
		for (E constant : type.getEnumConstants()) {
			if (constant.dbValue().equals(value)) {
				return constant;
			}
		}
		throw new IllegalArgumentException("Unknown " + type.getSimpleName() + " value: " + value);
	}

}
