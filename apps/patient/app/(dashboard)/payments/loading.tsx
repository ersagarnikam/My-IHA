import { Skeleton } from '@iha/ui'

export default function PaymentsLoading() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="h-6 w-28" />
        <Skeleton className="mt-1.5 h-4 w-48" />
      </div>

      <div className="space-y-2">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <Skeleton className="h-8 w-8 shrink-0 rounded-md" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-1/3" />
              <Skeleton className="h-3 w-1/4" />
            </div>
            <Skeleton className="h-5 w-16 shrink-0 rounded-full" />
          </div>
        ))}
      </div>
    </div>
  )
}
