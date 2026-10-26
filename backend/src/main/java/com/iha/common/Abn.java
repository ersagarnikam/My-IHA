package com.iha.common;

/** Australian Business Number helpers. */
public final class Abn {

	private Abn() {
	}

	/** Digits only: "51 824 753 556" → "51824753556". */
	public static String normalize(String value) {
		return value == null ? "" : value.replaceAll("\\s", "");
	}

	/** The ATO's weighted modulus-89 checksum. */
	public static boolean isValid(String value) {
		String v = normalize(value);
		if (!v.matches("\\d{11}")) {
			return false;
		}
		int[] weights = { 10, 1, 3, 5, 7, 9, 11, 13, 15, 17, 19 };
		int total = 0;
		for (int i = 0; i < 11; i++) {
			int digit = v.charAt(i) - '0';
			if (i == 0) {
				digit -= 1;
			}
			total += digit * weights[i];
		}
		return total % 89 == 0;
	}

	/** "51 824 753 556". */
	public static String format(String value) {
		String v = normalize(value);
		return v.length() == 11 ? v.substring(0, 2) + " " + v.substring(2, 5) + " " + v.substring(5, 8) + " "
				+ v.substring(8) : v;
	}

}
