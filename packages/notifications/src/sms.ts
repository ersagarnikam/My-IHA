import twilio from 'twilio'
import { createLogger } from '@iha/logger'
import { getNotificationChannelConfig } from './config'

const logger = createLogger('notifications:sms')

let twilioClient: ReturnType<typeof twilio> | null = null

function getTwilioClient(): ReturnType<typeof twilio> | null {
  const accountSid = process.env.TWILIO_ACCOUNT_SID
  const authToken = process.env.TWILIO_AUTH_TOKEN
  if (!accountSid || !authToken) {
    logger.error('TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN not set — skipping SMS send')
    return null
  }
  twilioClient ??= twilio(accountSid, authToken)
  return twilioClient
}

export type SendNotificationSmsParams = {
  to: string
  type: string
  message: string
  ctaUrl?: string
}

export async function sendNotificationSms(params: SendNotificationSmsParams): Promise<void> {
  const client = getTwilioClient()
  const from = process.env.TWILIO_PHONE_NUMBER
  if (!client || !from) return

  const { smsPrefix } = getNotificationChannelConfig(params.type)
  const body = `${smsPrefix}${params.message}${params.ctaUrl ? ` ${params.ctaUrl}` : ''}`

  try {
    await client.messages.create({ to: params.to, from, body })
  } catch (err) {
    logger.error({ err, type: params.type, to: params.to }, 'failed to send notification SMS')
  }
}
