import { Skeleton } from '@iha/ui'

export default function VisaFormLoading() {
  return (
    <div className="space-y-5">
      <div>
        <Skeleton className="mb-3 h-4 w-24" />
        <Skeleton className="h-6 w-56" />
        <Skeleton className="mt-2 h-4 w-64" />
      </div>

      <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
        {Array.from({ length: 5 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-32" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        ))}
      </div>
    </div>
  )
}
