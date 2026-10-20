import { getTranslations } from 'next-intl/server'

type Status = string

const STATUS_COLORS: Record<string, string> = {
  case_submitted:           'bg-blue-100 text-blue-700',
  under_review:             'bg-yellow-100 text-yellow-700',
  doctor_assigned:          'bg-purple-100 text-purple-700',
  evaluation:               'bg-purple-100 text-purple-700',
  treatment_plan:           'bg-orange-100 text-orange-700',
  treatment_confirmed:      'bg-emerald-100 text-emerald-700',
  payment_confirmed:        'bg-emerald-100 text-emerald-700',
  visa_documents_submitted: 'bg-blue-100 text-blue-700',
  visa_processing:          'bg-blue-100 text-blue-700',
  travel_ready:             'bg-emerald-100 text-emerald-700',
  visa_rejected:            'bg-red-100 text-red-700',
  completed:                'bg-slate-100 text-slate-600',
  closed:                   'bg-red-100 text-red-700',
}

export function getStatusColor(status: Status): string {
  return STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'
}

export function getStatusConfig(status: Status) {
  return {
    color: getStatusColor(status),
    label: status,
    description: '',
  }
}

export async function CaseStatusBadge({ status }: { status: Status }) {
  const t = await getTranslations('caseStatus')
  const color = getStatusColor(status)
  const label = t.has(`${status}.label`) ? t(`${status}.label` as never) : status

  return (
    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${color}`}>
      {label}
    </span>
  )
}

const IN_PROGRESS_STATUSES = new Set([
  'case_submitted', 'under_review', 'doctor_assigned', 'evaluation',
  'treatment_plan', 'treatment_confirmed', 'payment_confirmed',
  'visa_documents_submitted', 'visa_processing', 'travel_ready',
])

export function isInProgress(status: string) {
  return IN_PROGRESS_STATUSES.has(status)
}
