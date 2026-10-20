package com.iha.storage;

import java.io.InputStream;

import org.springframework.core.io.Resource;

/**
 * Private file storage, replacing the Supabase Storage buckets. Paths are
 * relative keys such as {@code case-documents/<patientId>/<caseId>/<file>};
 * callers enforce who may read them before calling {@link #load}.
 */
public interface StorageService {

	void store(String path, InputStream content);

	Resource load(String path);

	void delete(String path);

	/** Deletes everything under a folder prefix, e.g. {@code avatars/<patientId>}. */
	void deleteTree(String prefix);

}
