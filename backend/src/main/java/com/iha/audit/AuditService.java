package com.iha.audit;

import java.util.Map;
import java.util.UUID;

import tools.jackson.databind.json.JsonMapper;

import org.springframework.stereotype.Service;

/** Append-only audit trail (replaces {@code logAuditEvent} from {@code @iha/db/audit}). */
@Service
public class AuditService {

	private final AuditLogRepository repository;
	private final JsonMapper jsonMapper;

	public AuditService(AuditLogRepository repository, JsonMapper jsonMapper) {
		this.repository = repository;
		this.jsonMapper = jsonMapper;
	}

	/**
	 * @param app the portal the action came from: patient, doctor, hospital, lawyer or admin
	 */
	public void record(UUID actorId, String actorEmail, String app, String action, String entityType,
			Object entityId, Map<String, ?> metadata) {
		repository.save(new AuditLog(actorId, actorEmail, app, action, entityType,
				entityId == null ? null : entityId.toString(), jsonMapper.writeValueAsString(metadata)));
	}

}
