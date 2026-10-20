import { Skeleton } from '@iha/ui'

export default function NotificationsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-5 w-32" />
        <Skeleton className="mt-1.5 h-4 w-48" />
      </div>

      <div className="space-y-2">
        {Array.from({ length: 6 }).map((_, i) => (
          <div key={i} className="flex items-start gap-3 rounded-lg border border-slate-200 bg-white px-4 py-3">
            <Skeleton className="h-8 w-8 shrink-0 rounded-full" />
            <div className="min-w-0 flex-1 space-y-1.5">
              <Skeleton className="h-3.5 w-2/3" />
              <Skeleton className="h-3 w-1/3" />
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
