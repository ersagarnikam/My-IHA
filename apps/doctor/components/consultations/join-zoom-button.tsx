'use client'

import { useEffect, useState } from 'react'
import { Video } from 'lucide-react'

const JOIN_WINDOW_MINUTES_BEFORE = 15

type Props = {
  zoomLink: string
  slotStartIso: string
  slotEndIso: string
}

// Mirrors the patient-side join window in consultation-panel.tsx: the link
// only goes live 15 minutes before the slot starts and stays live until it
// ends, so the doctor can't join arbitrarily early/late either.
export function JoinZoomButton({ zoomLink, slotStartIso, slotEndIso }: Props) {
  const [now, setNow] = useState<Date | null>(null)

  useEffect(() => {
    setNow(new Date())
    const interval = setInterval(() => setNow(new Date()), 60000)
    return () => clearInterval(interval)
  }, [])

  if (!now) return null

  const slotStart = new Date(slotStartIso)
  const slotEnd = new Date(slotEndIso)
  const joinOpensAt = new Date(slotStart.getTime() - JOIN_WINDOW_MINUTES_BEFORE * 60000)
  const hasEnded = now > slotEnd
  const canJoin = now >= joinOpensAt && now <= slotEnd

  if (hasEnded) {
    return <p className="text-sm text-slate-400">This consultation has ended.</p>
  }

  if (!canJoin) {
    return (
      <div className="space-y-1.5">
        <span className="inline-flex items-center gap-2 rounded-lg bg-slate-100 px-4 py-2 text-sm font-medium text-slate-400">
          <Video className="h-4 w-4" />
          Join Zoom
        </span>
        <p className="text-xs text-slate-400">
          The join link becomes available {JOIN_WINDOW_MINUTES_BEFORE} minutes before the scheduled time.
        </p>
      </div>
    )
  }

  return (
    <a
      href={zoomLink}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-2 rounded-lg bg-cyan-600 px-4 py-2 text-sm font-medium text-white hover:bg-cyan-700"
    >
      <Video className="h-4 w-4" />
      Join Zoom
    </a>
  )
}
