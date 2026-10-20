package com.iha.consultation;

import java.util.Collection;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import org.springframework.data.jpa.repository.JpaRepository;

public interface ConsultationSlotRepository extends JpaRepository<ConsultationSlot, UUID> {

	List<ConsultationSlot> findByConsultationRequestIdInOrderBySlotTimeAsc(Collection<UUID> requestIds);

	Optional<ConsultationSlot> findByIdAndConsultationRequestId(UUID id, UUID requestId);

}
