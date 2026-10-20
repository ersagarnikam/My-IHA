package com.iha.crypto;

import java.math.BigDecimal;

import jakarta.persistence.AttributeConverter;
import jakarta.persistence.Converter;

/** Encrypts an amount as its plain decimal text (treatment plan fees). */
@Converter
public class EncryptedDecimalConverter implements AttributeConverter<BigDecimal, String> {

	private final PiiCipher cipher;

	public EncryptedDecimalConverter(PiiCipher cipher) {
		this.cipher = cipher;
	}

	@Override
	public String convertToDatabaseColumn(BigDecimal attribute) {
		return attribute == null ? null : cipher.encrypt(attribute.toPlainString());
	}

	@Override
	public BigDecimal convertToEntityAttribute(String dbData) {
		return dbData == null ? null : new BigDecimal(cipher.decrypt(dbData));
	}

}
