export const DOCTOR_TIME_ZONE = 'Australia/Sydney'

export function formatZonedDateTime(startIso: string, endIso: string, timeZone: string) {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const date = start.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone })
  const startTime = start.toLocaleString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone })
  const endTime = end.toLocaleString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone })
  return { date, range: `${startTime} - ${endTime}` }
}

export function getTimeZoneLabel(timeZone: string) {
  const city = timeZone.split('/').pop()?.replace(/_/g, ' ') ?? timeZone
  return `${city} Time`
}
