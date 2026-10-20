// PROVISIONAL — this label/color mapping is a first pass over the real,
// already-shipped visa_submissions.status values (see
// patient-portal/06-visa-documents.md and the "Status Model Conflict" note
// in visa-lawyer-portal/03-visa-case-management.md). The user has flagged
// that these badges need a follow-up discussion — don't treat this mapping
// as final. Shape mirrors packages/ui/src/case-status-badge.tsx.

type Status = string

const STATUS_COLORS: Record<string, string> = {
  documents_submitted: 'bg-amber-100 text-amber-700',
  under_review: 'bg-purple-100 text-purple-700',
  additional_docs_requested: 'bg-slate-100 text-slate-600',
  application_submitted: 'bg-blue-100 text-blue-700',
  processing: 'bg-blue-100 text-blue-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
}

const STATUS_LABELS: Record<string, string> = {
  documents_submitted: 'New',
  under_review: 'Under Review',
  additional_docs_requested: 'Docs Pending',
  application_submitted: 'In Progress',
  processing: 'In Progress',
  approved: 'Approved',
  rejected: 'Rejected',
}

export function getVisaStatusColor(status: Status): string {
  return STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'
}

export function getVisaStatusLabel(status: Status): string {
  return STATUS_LABELS[status] ?? status
}

// Single source of truth for the case-list tabs / dashboard stat buckets, so
// the badge label a case shows always matches the tab/count it's filed
// under. "In Progress" now means application_submitted/processing only —
// under_review (the lawyer is actively evaluating the application) gets its
// own bucket.
export type VisaStatusBucket =
  | 'new'
  | 'under_review'
  | 'docs_pending'
  | 'in_progress'
  | 'approved'
  | 'rejected'
  | 'other'

export function getVisaStatusBucket(status: Status): VisaStatusBucket {
  switch (status) {
    case 'documents_submitted':
      return 'new'
    case 'under_review':
      return 'under_review'
    case 'additional_docs_requested':
      return 'docs_pending'
    case 'application_submitted':
    case 'processing':
      return 'in_progress'
    case 'approved':
      return 'approved'
    case 'rejected':
      return 'rejected'
    default:
      return 'other'
  }
}

export function VisaStatusBadge({ status }: { status: Status }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${getVisaStatusColor(status)}`}
    >
      {getVisaStatusLabel(status)}
    </span>
  )
}
