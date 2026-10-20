import { Skeleton } from '@iha/ui'

export default function ProfileLoading() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="h-5 w-20" />
        <Skeleton className="mt-1.5 h-4 w-48" />
      </div>

      <div className="flex min-h-[500px] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white lg:flex-row">
        <div className="hidden w-56 shrink-0 space-y-1 border-r border-slate-200 p-3 lg:block">
          {Array.from({ length: 5 }).map((_, i) => (
            <Skeleton key={i} className="h-9 w-full rounded-md" />
          ))}
        </div>
        <div className="flex-1 space-y-4 p-5">
          {Array.from({ length: 3 }).map((_, i) => (
            <div key={i} className="space-y-3 rounded-lg border border-slate-200 p-4">
              <Skeleton className="h-4 w-32" />
              <Skeleton className="h-9 w-full rounded-md" />
              <Skeleton className="h-9 w-full rounded-md" />
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}
