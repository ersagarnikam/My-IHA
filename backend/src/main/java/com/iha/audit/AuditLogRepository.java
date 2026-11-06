package com.iha.audit;

import java.util.List;
import java.util.UUID;

import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AuditLogRepository extends JpaRepository<AuditLog, UUID> {

	List<AuditLog> findByAction(String action);

	List<AuditLog> findByActorIdOrderByCreatedAtDesc(UUID actorId, Pageable page);

	/** @param pattern a lowercase LIKE pattern */
	@Query("""
			select a from AuditLog a
			where lower(a.action) like :pattern or lower(coalesce(a.actorEmail, '')) like :pattern
				or lower(coalesce(a.entityType, '')) like :pattern or lower(coalesce(a.entityId, '')) like :pattern
			order by a.createdAt desc
			""")
	Page<AuditLog> search(@Param("pattern") String pattern, Pageable page);

}
