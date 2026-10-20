package com.iha.crypto;

import java.util.List;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;
import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/** Encrypts a list of strings as JSON (used for allergies, medications, aftercare steps). */
@Converter
public class EncryptedStringListConverter implements AttributeConverter<List<String>, String> {

	private static final TypeReference<List<String>> LIST = new TypeReference<>() {
	};

	private final PiiCipher cipher;
	private final JsonMapper jsonMapper;

	public EncryptedStringListConverter(PiiCipher cipher, JsonMapper jsonMapper) {
		this.cipher = cipher;
		this.jsonMapper = jsonMapper;
	}

	@Override
	public String convertToDatabaseColumn(List<String> attribute) {
		return attribute == null ? null : cipher.encrypt(jsonMapper.writeValueAsString(attribute));
	}

	@Override
	public List<String> convertToEntityAttribute(String dbData) {
		return dbData == null ? null : jsonMapper.readValue(cipher.decrypt(dbData), LIST);
	}

}
