import { Skeleton } from '@iha/ui'

export default function VisaDetailLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="mb-3 h-4 w-40" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-6 w-64" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
      </div>

      <div className="space-y-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="rounded-xl border border-slate-200 bg-white">
            <div className="border-b border-slate-100 px-5 py-3">
              <Skeleton className="h-4 w-40" />
            </div>
            <div className="grid gap-x-6 gap-y-4 p-5 sm:grid-cols-2">
              {Array.from({ length: 4 }).map((_, j) => (
                <div key={j} className="space-y-1.5">
                  <Skeleton className="h-3 w-20" />
                  <Skeleton className="h-3.5 w-32" />
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
