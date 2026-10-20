package com.iha.storage;

import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.Comparator;
import java.util.stream.Stream;

import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.stereotype.Service;

/** Stores files on the local disk under {@code iha.storage.root}. Swap for S3 or similar in production. */
@Service
public class LocalStorageService implements StorageService {

	private final Path root;

	public LocalStorageService(StorageProperties properties) {
		this.root = Path.of(properties.root()).toAbsolutePath().normalize();
	}

	@Override
	public void store(String path, InputStream content) {
		Path target = resolve(path);
		try {
			Files.createDirectories(target.getParent());
			Files.copy(content, target, StandardCopyOption.REPLACE_EXISTING);
		}
		catch (IOException ex) {
			throw new UncheckedIOException("Could not store " + path, ex);
		}
	}

	@Override
	public Resource load(String path) {
		Path target = resolve(path);
		if (!Files.isRegularFile(target)) {
			throw new UncheckedIOException(new IOException("No stored file at " + path));
		}
		return new FileSystemResource(target);
	}

	@Override
	public void delete(String path) {
		try {
			Files.deleteIfExists(resolve(path));
		}
		catch (IOException ex) {
			throw new UncheckedIOException("Could not delete " + path, ex);
		}
	}

	@Override
	public void deleteTree(String prefix) {
		Path folder = resolve(prefix);
		if (!Files.isDirectory(folder)) {
			return;
		}
		try (Stream<Path> paths = Files.walk(folder)) {
			for (Path path : paths.sorted(Comparator.reverseOrder()).toList()) {
				Files.deleteIfExists(path);
			}
		}
		catch (IOException ex) {
			throw new UncheckedIOException("Could not delete " + prefix, ex);
		}
	}

	private Path resolve(String path) {
		Path target = root.resolve(path).normalize();
		if (!target.startsWith(root)) {
			throw new IllegalArgumentException("Path escapes storage root: " + path);
		}
		return target;
	}

}
