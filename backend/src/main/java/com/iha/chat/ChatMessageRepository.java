package com.iha.chat;

import java.util.List;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

interface ChatMessageRepository extends JpaRepository<ChatMessage, UUID> {

	List<ChatMessage> findByThreadIdOrderByCreatedAtAsc(UUID threadId);

	long countByThreadIdAndSenderTypeAndReadFalse(UUID threadId, String senderType);

	@Modifying
	@Query("update ChatMessage m set m.read = true where m.threadId = :threadId and m.senderType = :senderType and m.read = false")
	int markRead(UUID threadId, String senderType);

}
