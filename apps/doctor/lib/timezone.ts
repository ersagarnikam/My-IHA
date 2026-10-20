// Doctors operate in Sydney time. No timezone library exists in this
// codebase — this uses the standard dependency-free Intl.DateTimeFormat
// offset-lookup trick rather than adding one.

export const DOCTOR_TIME_ZONE = 'Australia/Sydney'

// Display formatting mirrors apps/patient/lib/format-slot.ts's
// formatZonedDateTime (duplicated rather than shared — apps don't import
// each other's code in this monorepo).
export function formatZonedDateTime(startIso: string, endIso: string, timeZone: string = DOCTOR_TIME_ZONE) {
  const start = new Date(startIso)
  const end = new Date(endIso)
  const date = start.toLocaleString('en-AU', { weekday: 'short', day: 'numeric', month: 'short', timeZone })
  const startTime = start.toLocaleString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone })
  const endTime = end.toLocaleString('en-AU', { hour: 'numeric', minute: '2-digit', timeZone })
  return { date, range: `${startTime} - ${endTime}` }
}

function offsetMinutesForZone(guessUtc: Date, timeZone: string): number {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone,
    hourCycle: 'h23',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  }).formatToParts(guessUtc)

  const get = (type: string) => Number(parts.find((p) => p.type === type)?.value ?? 0)
  const asUtc = Date.UTC(get('year'), get('month') - 1, get('day'), get('hour'), get('minute'), get('second'))
  return (asUtc - guessUtc.getTime()) / 60000
}

// Converts a doctor-entered wall-clock date ("2026-08-15") and time
// ("14:00") in DOCTOR_TIME_ZONE into a correct UTC ISO string, honoring
// Sydney's DST offset for that specific date rather than "now"'s offset.
export function zonedWallTimeToUtcIso(dateStr: string, timeStr: string, timeZone: string = DOCTOR_TIME_ZONE): string {
  const guess = new Date(`${dateStr}T${timeStr}:00Z`)
  const offsetMinutes = offsetMinutesForZone(guess, timeZone)
  return new Date(guess.getTime() - offsetMinutes * 60000).toISOString()
}
