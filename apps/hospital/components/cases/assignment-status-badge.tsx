const STATUS_COLORS: Record<string, string> = {
  invited: 'bg-blue-100 text-blue-700',
  accepted: 'bg-emerald-100 text-emerald-700',
  declined: 'bg-red-100 text-red-700',
  withdrawn: 'bg-slate-100 text-slate-600',
}

const STATUS_LABELS: Record<string, string> = {
  invited: 'New',
  accepted: 'Active',
  declined: 'Declined',
  withdrawn: 'Withdrawn',
}

export function AssignmentStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'}`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
