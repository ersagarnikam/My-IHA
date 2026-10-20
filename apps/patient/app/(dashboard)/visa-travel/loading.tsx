import { Skeleton } from '@iha/ui'

export default function VisaTravelLoading() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="h-6 w-32" />
        <Skeleton className="mt-1.5 h-4 w-48" />
      </div>

      <div className="flex gap-2 border-b border-slate-200 pb-px">
        <Skeleton className="h-9 w-24 rounded-t-md" />
        <Skeleton className="h-9 w-24 rounded-t-md" />
      </div>

      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-20 w-full rounded-xl" />
        ))}
      </div>
    </div>
  )
}
