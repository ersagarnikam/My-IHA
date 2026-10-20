import { apiGet } from '../../lib/api'
import type { Notification } from '../../lib/cases'
import type { CaseVisa } from '../../lib/types'

const VISA_TYPES = new Set([
  'document_requested',
  'visa_status_updated',
  'visa_application_submitted',
  'visa_document_available',
])

/** Where clicking a notification goes (old resolveNotificationHref). */
export async function notificationHref(n: Pick<Notification, 'caseId' | 'type'>): Promise<string> {
  if (VISA_TYPES.has(n.type)) {
    if (n.caseId) {
      try {
        const visa = await apiGet<CaseVisa>(`/api/patient/cases/${n.caseId}/visa`)
        if (visa.submission?.formSubmitted) return `/patient/visa-travel/${visa.submission.id}`
      } catch {
        // Fall through to the list.
      }
    }
    return '/patient/visa-travel?tab=visa'
  }
  if (n.type === 'chat_message') return '/patient/messages'
  return n.caseId ? `/patient/cases/${n.caseId}` : '/patient/notifications'
}
