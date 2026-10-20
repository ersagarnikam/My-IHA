import { sendNotificationEmail } from './email'
import { sendNotificationSms } from './sms'

export type DispatchNotificationAlertsParams = {
  type: string
  title: string
  message: string
  ctaUrl?: string
  /** Base URL of the recipient's own portal — used for the email footer's notification-settings link. */
  appUrl: string
  email: string | null
  phone: string | null
  emailEnabled: boolean
  smsEnabled: boolean
}

/**
 * Fire-and-forget email/SMS alerts for a notification. In-portal display is
 * handled separately and cannot be disabled; this only covers the
 * supplementary email/SMS channels, gated by the patient's preferences.
 */
export async function dispatchNotificationAlerts(params: DispatchNotificationAlertsParams): Promise<void> {
  const tasks: Promise<void>[] = []

  if (params.emailEnabled && params.email) {
    tasks.push(
      sendNotificationEmail({
        to: params.email,
        type: params.type,
        title: params.title,
        message: params.message,
        ctaUrl: params.ctaUrl,
        appUrl: params.appUrl,
      }),
    )
  }

  if (params.smsEnabled && params.phone) {
    tasks.push(
      sendNotificationSms({
        to: params.phone,
        type: params.type,
        message: params.message,
        ctaUrl: params.ctaUrl,
      }),
    )
  }

  await Promise.all(tasks)
}
