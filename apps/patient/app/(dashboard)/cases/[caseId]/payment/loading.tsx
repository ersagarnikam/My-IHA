import { Skeleton } from '@iha/ui'

export default function PaymentLoading() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="mb-3 h-4 w-24" />
        <div className="flex items-center justify-between gap-3">
          <div className="space-y-2">
            <Skeleton className="h-6 w-40" />
            <Skeleton className="h-4 w-32" />
          </div>
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <Skeleton className="h-4 w-36" />
        <div className="space-y-2">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
        </div>
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    </div>
  )
}
