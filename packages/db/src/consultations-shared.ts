export const CONSULTATION_FEE_AUD = 200

export type ConsultationStatus = 'requested' | 'slots_proposed' | 'slot_selected' | 'scheduled' | 'cancelled'

export type ConsultationSlot = {
  id: string
  slot_time: string
  slot_end_time: string
}

export type ConsultationRequest = {
  id: string
  case_id: string
  treatment_option_id: string
  status: ConsultationStatus
  zoom_link: string | null
  selected_slot_id: string | null
  cancellation_reason: string | null
  requested_at: string
  updated_at: string
  slots: ConsultationSlot[]
}
