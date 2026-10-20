'use client'

import { useEffect, useState } from 'react'
import { Calendar, Clock } from 'lucide-react'
import { DOCTOR_TIME_ZONE, formatZonedDateTime, getTimeZoneLabel } from '@/lib/format-slot'

type Props = {
  startIso: string
  endIso: string
  className?: string
}

export function SlotTimeZones({ startIso, endIso, className }: Props) {
  const [patientTimeZone, setPatientTimeZone] = useState<string | null>(null)

  useEffect(() => {
    setPatientTimeZone(Intl.DateTimeFormat().resolvedOptions().timeZone)
  }, [])

  const doctor = formatZonedDateTime(startIso, endIso, DOCTOR_TIME_ZONE)
  const patient =
    patientTimeZone && patientTimeZone !== DOCTOR_TIME_ZONE
      ? { ...formatZonedDateTime(startIso, endIso, patientTimeZone), zoneLabel: getTimeZoneLabel(patientTimeZone) }
      : null

  return (
    <div className={className}>
      <div className="flex items-center gap-2">
        <Calendar className="h-4 w-4 shrink-0 text-slate-400" />
        <span>{doctor.date}</span>
      </div>
      <div className="mt-1 flex items-start gap-2">
        <Clock className="mt-0.5 h-4 w-4 shrink-0 text-slate-400" />
        <div>
          <div>
            {doctor.range} ({getTimeZoneLabel(DOCTOR_TIME_ZONE)})
          </div>
          {patient && (
            <div className="text-slate-500">
              {patient.range}
              {patient.date !== doctor.date ? `, ${patient.date}` : ''} ({patient.zoneLabel})
            </div>
          )}
        </div>
      </div>
    </div>
  )
}
