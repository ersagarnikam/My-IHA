import { Skeleton } from '@iha/ui'

export default function ProfileSetupLoading() {
  return (
    <div className="w-full space-y-6">
      <div className="flex items-center justify-center gap-4">
        {Array.from({ length: 3 }).map((_, i) => (
          <div key={i} className="flex items-center gap-2">
            <Skeleton className="h-8 w-8 rounded-full" />
            <Skeleton className="hidden h-3 w-20 sm:block" />
            {i < 2 && <Skeleton className="h-px w-10" />}
          </div>
        ))}
      </div>

      <div className="space-y-5 rounded-xl border border-slate-200 bg-white p-6">
        {Array.from({ length: 4 }).map((_, i) => (
          <div key={i} className="space-y-2">
            <Skeleton className="h-3 w-24" />
            <Skeleton className="h-10 w-full rounded-md" />
          </div>
        ))}
        <div className="flex justify-end pt-2">
          <Skeleton className="h-10 w-24 rounded-md" />
        </div>
      </div>
    </div>
  )
}
