'use client'

import { Plus, X } from 'lucide-react'
import { Button, DateInput, TimeInput } from '@iha/ui'

export type SlotRow = { date: string; startTime: string; endTime: string }

export function createEmptySlotRow(): SlotRow {
  return { date: '', startTime: '', endTime: '' }
}

function todayDateString(): string {
  return new Date().toISOString().slice(0, 10)
}

// Shared 1-3 date/start-time/end-time row UI used by both the inline
// propose-slots form and the reschedule dialog.
export function SlotRowsFields({
  slots,
  onChange,
  maxDate,
}: {
  slots: SlotRow[]
  onChange: (slots: SlotRow[]) => void
  maxDate?: string | null
}) {
  const today = todayDateString()

  function updateRow(index: number, patch: Partial<SlotRow>) {
    onChange(slots.map((s, i) => (i === index ? { ...s, ...patch } : s)))
  }

  function addRow() {
    if (slots.length >= 3) return
    onChange([...slots, createEmptySlotRow()])
  }

  function removeRow(index: number) {
    if (slots.length <= 1) return
    onChange(slots.filter((_, i) => i !== index))
  }

  return (
    <div className="space-y-3">
      {slots.map((slot, index) => (
        <div
          key={index}
          className="flex flex-col gap-2 rounded-lg border border-slate-200 p-3 sm:flex-row sm:items-end"
        >
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-500">Date</label>
            <DateInput
              value={slot.date}
              onChange={(e) => updateRow(index, { date: e.target.value })}
              min={today}
              max={maxDate ?? undefined}
              className="mt-1"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-500">Start Time</label>
            <TimeInput
              value={slot.startTime}
              onChange={(e) => updateRow(index, { startTime: e.target.value })}
              className="mt-1"
            />
          </div>
          <div className="flex-1">
            <label className="text-xs font-medium text-slate-500">End Time</label>
            <TimeInput
              value={slot.endTime}
              onChange={(e) => updateRow(index, { endTime: e.target.value })}
              className="mt-1"
            />
          </div>
          {slots.length > 1 && (
            <Button
              type="button"
              variant="outline"
              size="icon"
              onClick={() => removeRow(index)}
              aria-label="Remove time"
              className="h-10 w-10 shrink-0 self-end border-slate-200 text-slate-500 hover:bg-slate-50"
            >
              <X className="h-4 w-4" />
            </Button>
          )}
        </div>
      ))}
      {slots.length < 3 && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={addRow}
          className="gap-1 border-cyan-200 text-cyan-700 hover:bg-cyan-50"
        >
          <Plus className="h-3.5 w-3.5" />
          Add Another Time
        </Button>
      )}
    </div>
  )
}
