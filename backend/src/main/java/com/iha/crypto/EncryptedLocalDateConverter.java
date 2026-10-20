package com.iha.crypto;

import java.time.LocalDate;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Encrypts a date as its ISO-8601 text (e.g. date of birth). */
@Converter
public class EncryptedLocalDateConverter implements AttributeConverter<LocalDate, String> {

	private final PiiCipher cipher;

	public EncryptedLocalDateConverter(PiiCipher cipher) {
		this.cipher = cipher;
	}

	@Override
	public String convertToDatabaseColumn(LocalDate attribute) {
		return attribute == null ? null : cipher.encrypt(attribute.toString());
	}

	@Override
	public LocalDate convertToEntityAttribute(String dbData) {
		return dbData == null ? null : LocalDate.parse(cipher.decrypt(dbData));
	}

}
