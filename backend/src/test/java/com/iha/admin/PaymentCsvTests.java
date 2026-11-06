package com.iha.admin;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

import org.junit.jupiter.api.Test;

class PaymentCsvTests {

	@Test
	void userTextCannotBecomeAFormulaOrBreakTheColumns() {
		AdminPaymentController.PaymentRow row = new AdminPaymentController.PaymentRow("patient", UUID.randomUUID(),
				"treatment", "=HYPERLINK(\"http://x\"),Smith", UUID.randomUUID(), null, "MTA-2026-1",
				new BigDecimal("1200.50"), "paid", "stripe", "pi_1", Instant.parse("2026-01-01T00:00:00Z"), BigDecimal.ZERO,
				BigDecimal.ZERO, 0);

		String line = AdminPaymentController.csv(List.of(row)).split("\r\n")[1];

		assertThat(line).startsWith("\"2026-01-01 10:00\"");
		assertThat(line).contains("\"'=HYPERLINK(\"\"http://x\"\"),Smith\"", ",1200.50,");
	}

}
