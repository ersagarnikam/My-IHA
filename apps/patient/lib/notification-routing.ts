// Notification types that are specifically about a case's visa application —
// these should land on the visa detail page, not the general case page. Keep
// in sync with the `type` values insertNotification() is called with for visa
// flows (apps/visa/lib/actions/documents.ts, apps/visa/lib/actions/cases.ts,
// apps/patient/lib/actions/visa.ts, apps/hospital/lib/actions/visa-documents.ts).
// Used by resolveNotificationHref() (lib/actions/notifications.ts) to pick the
// destination, and by /visa-travel/[submissionId] to re-fetch the matching
// notification message.
export const VISA_NOTIFICATION_TYPES = new Set([
  'document_requested',
  'visa_status_updated',
  'visa_application_submitted',
  'visa_document_available',
])
