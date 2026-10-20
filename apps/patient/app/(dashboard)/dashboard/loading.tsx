import { Skeleton } from '@iha/ui'

export default function DashboardLoading() {
  return (
    <div className="space-y-6">
      <section>
        <Skeleton className="h-7 w-64" />
        <Skeleton className="mt-2 h-4 w-48" />
      </section>

      <Skeleton className="h-40 w-full rounded-xl" />

      <section>
        <Skeleton className="mb-3 h-4 w-28" />
        <div className="grid gap-4 sm:grid-cols-3">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="flex items-center gap-4 rounded-xl border border-slate-200 bg-white p-4">
              <Skeleton className="h-11 w-11 shrink-0 rounded-full" />
              <div className="min-w-0 flex-1 space-y-2">
                <Skeleton className="h-4 w-3/4" />
                <Skeleton className="h-3 w-full" />
              </div>
            </div>
          ))}
        </div>
      </section>

      <section>
        <Skeleton className="mb-3 h-4 w-24" />
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-xl border border-slate-200 bg-white p-4">
              <div className="flex items-start gap-3">
                <Skeleton className="h-10 w-10 shrink-0 rounded-md" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-2.5 w-16" />
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-2.5 w-20" />
                </div>
              </div>
              <Skeleton className="h-4 w-full rounded-full" />
            </div>
          ))}
        </div>
      </section>
    </div>
  )
}
