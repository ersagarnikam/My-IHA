import type { ConsultationStatus } from '@iha/db/consultations-shared'

const STATUS_COLORS: Record<ConsultationStatus, string> = {
  requested: 'bg-blue-100 text-blue-700',
  slots_proposed: 'bg-orange-100 text-orange-700',
  slot_selected: 'bg-purple-100 text-purple-700',
  scheduled: 'bg-emerald-100 text-emerald-700',
  cancelled: 'bg-red-100 text-red-700',
}

const STATUS_LABELS: Record<ConsultationStatus, string> = {
  requested: 'Awaiting Slots',
  slots_proposed: 'Awaiting Patient Confirmation',
  slot_selected: 'Awaiting Patient Confirmation',
  scheduled: 'Scheduled',
  cancelled: 'Cancelled',
}

export function getConsultationStatusLabel(status: ConsultationStatus): string {
  return STATUS_LABELS[status] ?? status
}

export function ConsultationStatusBadge({ status }: { status: ConsultationStatus }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'}`}
    >
      {getConsultationStatusLabel(status)}
    </span>
  )
}
