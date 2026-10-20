import { fetchConsultationRequestsForTreatmentOptions } from '@iha/db/consultations'
import type { ConsultationRequest } from '@iha/db/consultations'

export type { ConsultationRequest }

export async function fetchConsultationRequestsForOptions(
  treatmentOptionIds: string[],
): Promise<Record<string, ConsultationRequest>> {
  const { data } = await fetchConsultationRequestsForTreatmentOptions(treatmentOptionIds)
  return Object.fromEntries(data.map((c) => [c.treatment_option_id, c]))
}
