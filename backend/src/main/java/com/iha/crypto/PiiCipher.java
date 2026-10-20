package com.iha.crypto;

import java.nio.ByteBuffer;
import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.SecretKey;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.stereotype.Component;

/**
 * Column-level encryption for personal and medical data, replacing the old
 * pgcrypto {@code encrypt_pii}/{@code decrypt_pii} functions. AES-256-GCM with
 * a random 96-bit IV per value; stored as Base64(iv || ciphertext+tag).
 */
@Component
public class PiiCipher {

	private static final String TRANSFORMATION = "AES/GCM/NoPadding";
	private static final int IV_BYTES = 12;
	private static final int TAG_BITS = 128;

	private final SecretKey key;
	private final SecureRandom random = new SecureRandom();

	public PiiCipher(CryptoProperties properties) {
		byte[] raw = Base64.getDecoder().decode(properties.piiKey());
		if (raw.length != 32) {
			throw new IllegalStateException("iha.crypto.pii-key must decode to 32 bytes, got " + raw.length);
		}
		this.key = new SecretKeySpec(raw, "AES");
	}

	public String encrypt(String plaintext) {
		if (plaintext == null) {
			return null;
		}
		try {
			byte[] iv = new byte[IV_BYTES];
			random.nextBytes(iv);
			Cipher cipher = Cipher.getInstance(TRANSFORMATION);
			cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
			byte[] ciphertext = cipher.doFinal(plaintext.getBytes(StandardCharsets.UTF_8));
			return Base64.getEncoder().encodeToString(
					ByteBuffer.allocate(iv.length + ciphertext.length).put(iv).put(ciphertext).array());
		}
		catch (GeneralSecurityException ex) {
			throw new IllegalStateException("PII encryption failed", ex);
		}
	}

	public String decrypt(String encoded) {
		if (encoded == null) {
			return null;
		}
		try {
			byte[] payload = Base64.getDecoder().decode(encoded);
			Cipher cipher = Cipher.getInstance(TRANSFORMATION);
			cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, payload, 0, IV_BYTES));
			byte[] plaintext = cipher.doFinal(payload, IV_BYTES, payload.length - IV_BYTES);
			return new String(plaintext, StandardCharsets.UTF_8);
		}
		catch (GeneralSecurityException ex) {
			throw new IllegalStateException("PII decryption failed (wrong key or corrupted value)", ex);
		}
	}

}
