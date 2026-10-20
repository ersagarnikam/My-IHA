const STATUS_COLORS: Record<string, string> = {
  pending: 'bg-yellow-100 text-yellow-700',
  approved: 'bg-emerald-100 text-emerald-700',
  rejected: 'bg-red-100 text-red-700',
  more_info_requested: 'bg-orange-100 text-orange-700',
}

const STATUS_LABELS: Record<string, string> = {
  pending: 'Pending',
  approved: 'Approved',
  rejected: 'Rejected',
  more_info_requested: 'More Info Requested',
}

export function DoctorStatusBadge({ status }: { status: string }) {
  return (
    <span
      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ${
        STATUS_COLORS[status] ?? 'bg-slate-100 text-slate-600'
      }`}
    >
      {STATUS_LABELS[status] ?? status}
    </span>
  )
}
