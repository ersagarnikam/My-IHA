package com.iha.fees;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** One of MTA's business details (seeded in V10); see {@link BusinessSettingsService}. */
@Entity
@Table(name = "business_settings")
public class BusinessSetting {

	@Id
	@Column(name = "setting_key")
	private String key;

	@Column(name = "setting_value")
	private String value;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	@Column(name = "updated_by")
	private String updatedBy;

	protected BusinessSetting() {
	}

	BusinessSetting(String key, String value) {
		this.key = key;
		this.value = value;
		this.updatedAt = Instant.now();
	}

	void change(String value, String by) {
		this.value = value;
		this.updatedBy = by;
		this.updatedAt = Instant.now();
	}

	public String getKey() {
		return key;
	}

	public String getValue() {
		return value;
	}

	public Instant getUpdatedAt() {
		return updatedAt;
	}

	public String getUpdatedBy() {
		return updatedBy;
	}

}
