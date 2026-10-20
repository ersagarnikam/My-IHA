import { Skeleton } from '@iha/ui'

function CaseCardSkeleton() {
  return (
    <div className="space-y-3 rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0 flex-1 space-y-1.5">
          <Skeleton className="h-3 w-20" />
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-3 w-24" />
        </div>
        <Skeleton className="h-5 w-20 shrink-0 rounded-full" />
      </div>
      <Skeleton className="h-3 w-full" />
    </div>
  )
}

export default function CasesLoading() {
  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="space-y-2">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-48" />
        </div>
        <Skeleton className="h-10 w-36 rounded-md" />
      </div>

      <div className="space-y-8">
        <section>
          <Skeleton className="mb-3 h-4 w-32" />
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {Array.from({ length: 3 }).map((_, i) => <CaseCardSkeleton key={i} />)}
          </div>
        </section>
      </div>
    </div>
  )
}
