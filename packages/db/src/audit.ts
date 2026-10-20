import { createClient } from './server'
import { createLogger } from '@iha/logger'
import type { Json } from '../types'

const logger = createLogger('db:audit')

export type AuditApp = 'patient' | 'admin' | 'hospital' | 'visa' | 'doctor'

export type AuditAction =
  | 'auth.login_succeeded'
  | 'auth.login_failed'
  | 'auth.logout'
  | 'auth.signup'
  | 'auth.password_reset_requested'
  | 'auth.password_reset_completed'
  | 'auth.email_verified'
  | 'registration.hospital_submitted'
  | 'registration.doctor_submitted'
  | 'registration.lawyer_submitted'
  | 'registration.resubmitted'
  | 'patient.account_deleted'
  | 'patient.personal_info_updated'
  | 'patient.medical_background_updated'
  | 'patient.emergency_contact_updated'
  | 'patient.avatar_updated'
  | 'patient.notification_preferences_updated'
  | 'doctor.profile_updated'
  | 'doctor.professional_details_updated'
  | 'doctor.avatar_updated'
  | 'doctor.availability_updated'
  | 'doctor.notification_preferences_updated'
  | 'hospital.profile_updated'
  | 'hospital.details_updated'
  | 'hospital.notification_preferences_updated'
  | 'lawyer.profile_updated'
  | 'lawyer.professional_details_updated'
  | 'lawyer.notification_preferences_updated'
  | 'case.submitted'
  | 'case.documents_added'
  | 'case.travel_assistance_updated'
  | 'treatment_option.selected'
  | 'consultation.requested'
  | 'consultation.slot_selected'
  | 'consultation.payment_completed'
  | 'consultation.scheduled'
  | 'consultation.slots_proposed'
  | 'consultation.cancelled'
  | 'visa.submitted'
  | 'visa.document_added'
  | 'visa.documents_added'
  | 'visa_document.generated'
  | 'visa_document.sent_to_patient'
  | 'payment.intent_created'
  | 'payment.completed'
  | 'payment.invoice_downloaded'
  | 'payment.method_added'
  | 'payment.method_removed'
  | 'payment.method_set_default'
  | 'case_assignment.accepted'
  | 'case_assignment.declined'
  | 'case_assignment.withdrawn'
  | 'case.additional_info_requested'
  | 'case.evaluation_started'
  | 'case.marked_completed'
  | 'treatment_plan.draft_saved'
  | 'treatment_plan.submitted'
  | 'provider_message.sent'
  | 'provider_message.reopen_requested'
  | 'fee.intent_created'
  | 'fee.payment_completed'
  | 'fee.invoice_downloaded'

type RpcClient = {
  rpc: (
    fn: 'log_audit_event',
    args: {
      p_app: AuditApp
      p_action: AuditAction
      p_entity_type?: string | null
      p_entity_id?: string | null
      p_metadata?: Json
    },
  ) => Promise<{ error: { message: string } | null }>
}

export async function logAuditEvent(event: {
  app: AuditApp
  action: AuditAction
  entityType?: string
  entityId?: string
  metadata?: Record<string, unknown>
}): Promise<void> {
  const supabase = (await createClient()) as unknown as RpcClient
  const { error } = await supabase.rpc('log_audit_event', {
    p_app: event.app,
    p_action: event.action,
    p_entity_type: event.entityType ?? null,
    p_entity_id: event.entityId ?? null,
    p_metadata: (event.metadata ?? {}) as Json,
  })

  if (error) {
    logger.error({ err: error, action: event.action }, 'failed to write audit log')
  }
}
