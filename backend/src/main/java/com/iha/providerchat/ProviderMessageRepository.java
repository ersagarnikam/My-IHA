package com.iha.providerchat;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface ProviderMessageRepository extends JpaRepository<ProviderMessage, UUID> {

	List<ProviderMessage> findByThreadIdOrderByCreatedAtAsc(UUID threadId);

	long countByThreadIdAndSenderTypeAndReadFalse(UUID threadId, String senderType);

	@Modifying(clearAutomatically = true)
	@Query("update ProviderMessage m set m.read = true where m.threadId = :threadId and m.senderType = :senderType and m.read = false")
	int markRead(UUID threadId, String senderType);

}
