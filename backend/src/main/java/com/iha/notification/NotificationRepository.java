package com.iha.notification;

import java.time.Instant;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface NotificationRepository extends JpaRepository<Notification, UUID> {

	List<Notification> findByUserIdOrderByCreatedAtDesc(UUID userId, Pageable page);

	List<Notification> findByCaseIdAndUserIdOrderByCreatedAtAsc(UUID caseId, UUID userId);

	Optional<Notification> findByIdAndUserId(UUID id, UUID userId);

	long countByUserIdAndReadFalse(UUID userId);

	boolean existsByUserIdAndTypeAndTitleAndCaseIdAndCreatedAtAfter(UUID userId, String type, String title, UUID caseId,
			Instant after);

	@Modifying
	@Query("update Notification n set n.read = true where n.userId = :userId and n.read = false")
	int markAllRead(UUID userId);

}
