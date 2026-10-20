'use client'

import { useState } from 'react'
import { toast } from 'sonner'
import { Button, ToggleSwitch } from '@iha/ui'
import { availabilityDayLabels, type AvailabilityDay } from '@/lib/validations/account-settings'
import { updateDoctorAvailability } from '@/lib/actions/account-settings'

const TIME_OPTIONS: { value: string; label: string }[] = Array.from({ length: 48 }, (_, i) => {
  const hour24 = Math.floor(i / 2)
  const minute = i % 2 === 0 ? '00' : '30'
  const period = hour24 < 12 ? 'AM' : 'PM'
  const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
  const value = `${String(hour24).padStart(2, '0')}:${minute}`
  const label = `${String(hour12).padStart(2, '0')}:${minute} ${period}`
  return { value, label }
})

function TimeSelect({
  value,
  onChange,
  disabled,
}: {
  value: string
  onChange: (value: string) => void
  disabled?: boolean
}) {
  return (
    <select
      value={value}
      disabled={disabled}
      onChange={(e) => onChange(e.target.value)}
      className="h-9 rounded-md border border-input bg-background px-2.5 text-sm ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring disabled:cursor-not-allowed disabled:opacity-50"
    >
      {TIME_OPTIONS.map((opt) => (
        <option key={opt.value} value={opt.value}>
          {opt.label}
        </option>
      ))}
    </select>
  )
}

export function AvailabilityTab({ schedule }: { schedule: AvailabilityDay[] }) {
  const [days, setDays] = useState<AvailabilityDay[]>(schedule)
  const [isSaving, setIsSaving] = useState(false)

  function updateDay(index: number, patch: Partial<AvailabilityDay>) {
    setDays((prev) => prev.map((d, i) => (i === index ? { ...d, ...patch } : d)))
  }

  async function onSave() {
    setIsSaving(true)
    const result = await updateDoctorAvailability(days)
    setIsSaving(false)
    if (result.error) {
      toast.error(result.error, { duration: Infinity })
      return
    }
    toast.success('Availability updated.')
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Availability</h2>
        <p className="mt-1 text-sm text-slate-500">Set the hours you&apos;re available each day of the week.</p>
      </div>

      <div className="divide-y divide-slate-100">
        {days.map((day, index) => (
          <div key={day.day} className="flex items-center justify-between gap-4 py-3">
            <div className="flex items-center gap-3">
              <ToggleSwitch checked={day.enabled} onChange={(enabled) => updateDay(index, { enabled })} />
              <span className="text-sm font-medium text-slate-900">{availabilityDayLabels[day.day]}</span>
            </div>
            {day.enabled ? (
              <div className="flex items-center gap-2">
                <TimeSelect value={day.start_time} onChange={(start_time) => updateDay(index, { start_time })} />
                <span className="text-sm text-slate-400">to</span>
                <TimeSelect value={day.end_time} onChange={(end_time) => updateDay(index, { end_time })} />
              </div>
            ) : (
              <span className="text-sm text-slate-400">Not Working On this Day</span>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-2 pt-1">
        <Button type="button" size="sm" loading={isSaving} onClick={onSave} className="bg-cyan-600 hover:bg-cyan-700 text-white">
          Save
        </Button>
        <Button type="button" variant="outline" size="sm" onClick={() => setDays(schedule)}>
          Cancel
        </Button>
      </div>
    </div>
  )
}
