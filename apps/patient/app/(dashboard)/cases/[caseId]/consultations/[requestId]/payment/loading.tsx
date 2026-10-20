import { Skeleton } from '@iha/ui'

export default function ConsultationPaymentLoading() {
  return (
    <div className="space-y-4">
      <div>
        <Skeleton className="mb-3 h-4 w-24" />
        <Skeleton className="h-6 w-52" />
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <Skeleton className="mb-4 h-4 w-40" />
        <Skeleton className="mb-4 h-10 w-full rounded-md" />
        <div className="flex items-center justify-between">
          <Skeleton className="h-4 w-32" />
          <Skeleton className="h-4 w-20" />
        </div>
      </div>

      <div className="space-y-4 rounded-xl border border-slate-200 bg-white p-6">
        <Skeleton className="h-32 w-full rounded-lg" />
        <Skeleton className="h-10 w-full rounded-md" />
      </div>
    </div>
  )
}
