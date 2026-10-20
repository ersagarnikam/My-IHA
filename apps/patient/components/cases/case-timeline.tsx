import { getTranslations } from 'next-intl/server'
import type { Notification } from '@iha/db/types'
import { getStatusColor } from './case-status-badge'

// Keyed on the literal title text the `notify_case_status_change` DB trigger
// writes (packages/db/supabase/migrations/20260624000003_notify_case_status_change.sql) —
// that text is plain English and not translated, so it's only used here to
// recover which status a notification belongs to. The actual label/description
// shown to the user comes from the `caseStatus` translations below.
const TITLE_TO_STATUS: Record<string, string> = {
  'Case submitted': 'case_submitted',
  'Case under review': 'under_review',
  'Doctor assigned': 'doctor_assigned',
  'Case in evaluation': 'evaluation',
  'Treatment plan ready': 'treatment_plan',
  'Treatment confirmed': 'treatment_confirmed',
  'Payment confirmed': 'payment_confirmed',
  'Visa documents submitted': 'visa_documents_submitted',
  'Visa processing started': 'visa_processing',
  'Travel ready': 'travel_ready',
  'Visa application rejected': 'visa_rejected',
  'Case completed': 'completed',
  'Case closed': 'closed',
}

function formatDate(iso: string): string {
  const date = new Date(iso)
  const day = date.getDate()
  const month = date.toLocaleDateString('en-AU', { month: 'short' }).toUpperCase()
  return `${day} ${month}, ${date.getFullYear()}`
}

const STATUS_DOT_COLORS: Record<string, string> = {
  case_submitted: 'bg-blue-600',
  under_review: 'bg-yellow-600',
  doctor_assigned: 'bg-purple-600',
  evaluation: 'bg-purple-600',
  treatment_plan: 'bg-orange-600',
  treatment_confirmed: 'bg-emerald-600',
  payment_confirmed: 'bg-emerald-600',
  visa_documents_submitted: 'bg-blue-600',
  visa_processing: 'bg-blue-600',
  travel_ready: 'bg-emerald-600',
  visa_rejected: 'bg-red-600',
  completed: 'bg-slate-600',
  closed: 'bg-red-600',
}

function getDotColor(status: string): string {
  return STATUS_DOT_COLORS[status] ?? 'bg-slate-600'
}

type TimelineEntry = {
  id: string
  status: string
  created_at: string
}

export async function CaseTimeline({
  notifications,
}: {
  notifications: Notification[]
}) {
  const t = await getTranslations('caseDetail')
  const tStatus = await getTranslations('caseStatus')

  const entries: TimelineEntry[] = notifications
    .flatMap((n) => {
      const status = TITLE_TO_STATUS[n.title]
      return status ? [{ id: n.id, status, created_at: n.created_at }] : []
    })
    .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="mb-4 flex items-center justify-between gap-3">
        <h2 className="text-base font-semibold text-slate-900">{t('timeline')}</h2>
      </div>

      <div className="space-y-6">
        {entries.map((entry, index) => {
          const color = getStatusColor(entry.status)
          const dotColor = getDotColor(entry.status)
          const isLast = index === entries.length - 1
          return (
            <div key={entry.id} className="relative flex gap-4">
              <div className="w-28 shrink-0 pt-0.5">
                <span className={`inline-block whitespace-nowrap rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide ${color}`}>
                  {formatDate(entry.created_at)}
                </span>
              </div>
              <div className="relative w-4 shrink-0">
                <span className={`absolute left-1/2 top-0 h-2.5 w-2.5 -translate-x-1/2 rounded-full ring-4 ring-white ${dotColor}`} />
                {!isLast && (
                  <span className="absolute left-1/2 top-2.5 -bottom-6 w-px -translate-x-1/2 bg-slate-200" />
                )}
              </div>
              <div className="min-w-0 flex-1 pb-1">
                <p className="text-sm font-semibold text-slate-900">{tStatus(`${entry.status}.label` as never)}</p>
                <p className="mt-1 text-sm text-slate-500">{tStatus(`${entry.status}.description` as never)}</p>
              </div>
            </div>
          )
        })}
      </div>
    </section>
  )
}
