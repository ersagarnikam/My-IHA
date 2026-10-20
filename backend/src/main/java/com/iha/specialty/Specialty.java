package com.iha.specialty;

import java.util.UUID;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "specialties")
public class Specialty {

	/** The free-text "Other" specialty; cases using it must fill {@code specialty_other}. */
	public static final String OTHER = "Other";

	@Id
	private UUID id;

	@Column(nullable = false)
	private String name;

	@Column(name = "label_en", nullable = false)
	private String labelEn;

	@Column(name = "label_zh", nullable = false)
	private String labelZh;

	@Column(name = "is_active", nullable = false)
	private boolean active;

	@Column(name = "sort_order", nullable = false)
	private int sortOrder;

	protected Specialty() {
	}

	public String getName() {
		return name;
	}

	public String getLabelEn() {
		return labelEn;
	}

	public String getLabelZh() {
		return labelZh;
	}

}
