package com.iha.crypto;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/**
 * Apply with {@code @Convert(converter = EncryptedStringConverter.class)} on
 * columns named {@code *_enc}. Hibernate obtains it from the Spring context, so
 * the cipher is injected.
 */
@Converter
public class EncryptedStringConverter implements AttributeConverter<String, String> {

	private final PiiCipher cipher;

	public EncryptedStringConverter(PiiCipher cipher) {
		this.cipher = cipher;
	}

	@Override
	public String convertToDatabaseColumn(String attribute) {
		return cipher.encrypt(attribute);
	}

	@Override
	public String convertToEntityAttribute(String dbData) {
		return cipher.decrypt(dbData);
	}

}
