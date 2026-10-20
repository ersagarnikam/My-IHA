export type NotificationType =
  | 'welcome'
  | 'case_submitted'
  | 'case_status_updated'
  | 'treatment_plan_ready'
  | 'treatment_confirmed'
  | 'consultation_requested'
  | 'consultation_slot_selected'
  | 'consultation_scheduled'
  | 'document_requested'
  | 'additional_info_requested'
  | 'visa_status_updated'
  | 'visa_application_submitted'
  | 'payment_confirmed'
  | 'visa_approved'
  | 'visa_document_available'
  | 'case_closed_other_doctor_selected'
  | 'case_closed_plan_not_presented'
  | 'case_assigned_by_admin'

type ChannelConfig = {
  /** Email subject prefix shown before the notification title. */
  emailSubject: (title: string) => string
  /** Label for the CTA button in the email / link reference in the SMS. */
  ctaLabel: string
  /** Short prefix prepended to the notification message for SMS. */
  smsPrefix: string
}

const DEFAULT_CONFIG: ChannelConfig = {
  emailSubject: (title) => title,
  ctaLabel: 'View in portal',
  smsPrefix: 'MTA: ',
}

const NOTIFICATION_CONFIG: Record<NotificationType, ChannelConfig> = {
  welcome: {
    emailSubject: (title) => title,
    ctaLabel: 'View notifications',
    smsPrefix: 'MTA: ',
  },
  case_submitted: {
    emailSubject: (title) => title,
    ctaLabel: 'View case',
    smsPrefix: 'MTA: ',
  },
  case_status_updated: {
    emailSubject: (title) => title,
    ctaLabel: 'View case',
    smsPrefix: 'MTA: ',
  },
  treatment_plan_ready: {
    emailSubject: (title) => title,
    ctaLabel: 'Review treatment options',
    smsPrefix: 'MTA: ',
  },
  treatment_confirmed: {
    emailSubject: (title) => title,
    ctaLabel: 'View case',
    smsPrefix: 'MTA: ',
  },
  consultation_requested: {
    emailSubject: (title) => title,
    ctaLabel: 'View case',
    smsPrefix: 'MTA: ',
  },
  consultation_slot_selected: {
    emailSubject: (title) => title,
    ctaLabel: 'Make payment',
    smsPrefix: 'MTA: ',
  },
  consultation_scheduled: {
    emailSubject: (title) => title,
    ctaLabel: 'View consultation',
    smsPrefix: 'MTA: ',
  },
  document_requested: {
    emailSubject: (title) => `Action required: ${title}`,
    ctaLabel: 'View visa documents',
    smsPrefix: 'MTA: Action required — ',
  },
  additional_info_requested: {
    emailSubject: (title) => `Action required: ${title}`,
    ctaLabel: 'Upload documents',
    smsPrefix: 'MTA: Action required — ',
  },
  visa_status_updated: {
    emailSubject: (title) => title,
    ctaLabel: 'View visa status',
    smsPrefix: 'MTA: ',
  },
  visa_application_submitted: {
    emailSubject: (title) => title,
    ctaLabel: 'View visa application',
    smsPrefix: 'MTA: ',
  },
  payment_confirmed: {
    emailSubject: (title) => title,
    ctaLabel: 'View payment',
    smsPrefix: 'MTA: ',
  },
  visa_approved: {
    emailSubject: (title) => title,
    ctaLabel: 'Download visa',
    smsPrefix: 'MTA: ',
  },
  visa_document_available: {
    emailSubject: (title) => title,
    ctaLabel: 'Download document',
    smsPrefix: 'MTA: ',
  },
  case_closed_other_doctor_selected: {
    emailSubject: (title) => title,
    ctaLabel: 'View case',
    smsPrefix: 'MTA: ',
  },
  case_closed_plan_not_presented: {
    emailSubject: (title) => title,
    ctaLabel: 'View case',
    smsPrefix: 'MTA: ',
  },
  case_assigned_by_admin: {
    emailSubject: (title) => title,
    ctaLabel: 'View case',
    smsPrefix: 'MTA: ',
  },
}

export function getNotificationChannelConfig(type: string): ChannelConfig {
  return NOTIFICATION_CONFIG[type as NotificationType] ?? DEFAULT_CONFIG
}
