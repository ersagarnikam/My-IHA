package com.iha.patient;

import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import java.util.UUID;

import com.iha.audit.AuditService;
import com.iha.auth.AppUserRepository;
import com.iha.fees.BusinessSettingsService;
import com.iha.storage.StorageService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Deleted patient accounts, in two steps (replaces the
 * {@code hard-delete-expired-patients} Edge Function, which erased everything):
 * <ol>
 * <li>After {@link Patient#DELETION_GRACE} the account is <b>closed</b>: the
 * login is erased (email replaced, password unusable), so is the contact data
 * and photo, and the health and payment records are kept for the retention
 * period set by MTA (default 7 years: health records legislation and tax
 * record-keeping; for MTA's lawyer to confirm).</li>
 * <li>When that has passed the records are <b>purged</b>: files, then the
 * account, which cascades to the patient, cases, documents, payments and visa
 * data.</li>
 * </ol>
 */
@Component
class PatientRetentionJob {

	private static final Logger log = LoggerFactory.getLogger(PatientRetentionJob.class);

	private final PatientRepository patients;
	private final AppUserRepository users;
	private final StorageService storage;
	private final BusinessSettingsService settings;
	private final PasswordEncoder passwordEncoder;
	private final AuditService audit;

	PatientRetentionJob(PatientRepository patients, AppUserRepository users, StorageService storage,
			BusinessSettingsService settings, PasswordEncoder passwordEncoder, AuditService audit) {
		this.patients = patients;
		this.users = users;
		this.storage = storage;
		this.settings = settings;
		this.passwordEncoder = passwordEncoder;
		this.audit = audit;
	}

	@Scheduled(cron = "${iha.retention.cron:0 30 3 * * *}")
	@Transactional
	public void run() {
		closeAccounts(Instant.now());
		purgeExpired(Instant.now());
	}

	@Transactional
	public void closeAccounts(Instant now) {
		int years = settings.privacy().retentionYears();
		for (Patient patient : patients.findByDeletedTrueAndAccountClosedAtIsNullAndScheduledDeleteAtBefore(now)) {
			if (patient.getAvatarPath() != null) {
				storage.delete(patient.getAvatarPath());
			}
			Instant retainUntil = now.atOffset(ZoneOffset.UTC).plusYears(years).toInstant();
			patient.closeAccount(retainUntil);
			users.findById(patient.getUserId())
				.ifPresent(u -> u.close("closed+" + u.getId() + "@deleted.invalid",
						passwordEncoder.encode(UUID.randomUUID().toString())));
			audit.record(null, null, "system", "account.closed", "patient", patient.getId(),
					Map.of("retain_until", retainUntil.toString()));
			log.info("Closed deleted patient account {}; records kept until {}", patient.getId(), retainUntil);
		}
	}

	@Transactional
	public void purgeExpired(Instant now) {
		for (Patient patient : patients.findByDeletedTrueAndRetainUntilBefore(now)) {
			for (String folder : new String[] { "case-documents/", "visa-documents/", "avatars/" }) {
				storage.deleteTree(folder + patient.getId());
			}
			users.deleteById(patient.getUserId());
			log.info("Purged patient {} after the retention period", patient.getId());
		}
	}

}
