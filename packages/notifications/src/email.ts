import { Resend } from 'resend'
import { createLogger } from '@iha/logger'
import { NotificationEmail } from './templates/notification-email'
import { getNotificationChannelConfig } from './config'

const logger = createLogger('notifications:email')

const FROM_ADDRESS = process.env.RESEND_FROM_ADDRESS ?? 'MTA Patient Portal <onboarding@resend.dev>'

let resendClient: Resend | null = null

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY
  if (!apiKey) {
    logger.error('RESEND_API_KEY not set — skipping email send')
    return null
  }
  resendClient ??= new Resend(apiKey)
  return resendClient
}

export type SendNotificationEmailParams = {
  to: string
  type: string
  title: string
  message: string
  ctaUrl?: string
  /** Base URL of the recipient's own portal — used for the email footer's notification-settings link. */
  appUrl: string
}

export async function sendNotificationEmail(params: SendNotificationEmailParams): Promise<void> {
  const client = getResendClient()
  if (!client) return

  const { emailSubject, ctaLabel } = getNotificationChannelConfig(params.type)

  try {
    const { error } = await client.emails.send({
      from: FROM_ADDRESS,
      to: params.to,
      subject: emailSubject(params.title),
      react: NotificationEmail({
        heading: params.title,
        message: params.message,
        ctaUrl: params.ctaUrl,
        ctaLabel,
        appUrl: params.appUrl,
      }),
    })

    if (error) {
      logger.error({ err: error, type: params.type, to: params.to }, 'failed to send notification email')
    }
  } catch (err) {
    logger.error({ err, type: params.type, to: params.to }, 'failed to send notification email')
  }
}
