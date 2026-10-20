import { Skeleton } from '@iha/ui'

export default function TreatmentsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-6 w-28" />
        <Skeleton className="mt-1.5 h-4 w-48" />
      </div>

      <div className="space-y-4">
        {Array.from({ length: 2 }).map((_, i) => (
          <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
            <div className="flex items-center justify-between">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-5 w-20 rounded-full" />
            </div>
            <Skeleton className="h-24 w-full rounded-lg" />
          </div>
        ))}
      </div>
    </div>
  )
}
