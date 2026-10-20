package com.iha.patient;

import java.util.UUID;

/** Published inside the registration transaction (e.g. the chat module creates the support thread). */
public record PatientRegisteredEvent(UUID patientId, UUID userId) {
}
