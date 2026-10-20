package com.iha.patient;

import java.time.Instant;

import com.iha.auth.AppUserRepository;
import com.iha.storage.StorageService;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;
import org.springframework.transaction.annotation.Transactional;

/**
 * Hard-deletes patients whose deletion grace period has passed (replaces the
 * {@code hard-delete-expired-patients} Edge Function). Deleting the account
 * cascades to the patient row, cases, documents, payments and visa data.
 */
@Component
class PatientRetentionJob {

	private static final Logger log = LoggerFactory.getLogger(PatientRetentionJob.class);

	private final PatientRepository patients;
	private final AppUserRepository users;
	private final StorageService storage;

	PatientRetentionJob(PatientRepository patients, AppUserRepository users, StorageService storage) {
		this.patients = patients;
		this.users = users;
		this.storage = storage;
	}

	@Scheduled(cron = "${iha.retention.cron:0 30 3 * * *}")
	@Transactional
	public void purgeExpired() {
		for (Patient patient : patients.findByDeletedTrueAndScheduledDeleteAtBefore(Instant.now())) {
			for (String folder : new String[] { "case-documents/", "visa-documents/", "avatars/" }) {
				storage.deleteTree(folder + patient.getId());
			}
			users.deleteById(patient.getUserId());
			log.info("Hard-deleted patient {} after the deletion grace period", patient.getId());
		}
	}

}
