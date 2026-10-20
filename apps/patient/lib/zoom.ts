import { createLogger } from '@iha/logger'

const logger = createLogger('patient:zoom')

async function getZoomAccessToken(): Promise<string> {
  const accountId = process.env.ZOOM_ACCOUNT_ID!
  const clientId = process.env.ZOOM_CLIENT_ID!
  const clientSecret = process.env.ZOOM_CLIENT_SECRET!

  const credentials = Buffer.from(`${clientId}:${clientSecret}`).toString('base64')

  const res = await fetch(
    `https://zoom.us/oauth/token?grant_type=account_credentials&account_id=${accountId}`,
    {
      method: 'POST',
      headers: { Authorization: `Basic ${credentials}` },
    },
  )

  if (!res.ok) {
    throw new Error(`Failed to obtain Zoom access token: ${res.status}`)
  }

  const data = (await res.json()) as { access_token: string }
  return data.access_token
}

export async function createZoomMeeting(params: {
  topic: string
  startTimeIso: string
  durationMinutes?: number
}): Promise<{ joinUrl: string }> {
  const token = await getZoomAccessToken()

  const res = await fetch('https://api.zoom.us/v2/users/me/meetings', {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      topic: params.topic,
      type: 2, // scheduled meeting
      start_time: params.startTimeIso,
      duration: params.durationMinutes ?? 30,
      timezone: 'UTC',
      settings: { join_before_host: true, waiting_room: false },
    }),
  })

  if (!res.ok) {
    const text = await res.text()
    logger.error({ status: res.status, body: text }, 'Zoom meeting creation failed')
    throw new Error(`Zoom meeting creation failed: ${res.status}`)
  }

  const data = (await res.json()) as { join_url: string }
  return { joinUrl: data.join_url }
}
