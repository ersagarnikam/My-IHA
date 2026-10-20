import { Skeleton } from '@iha/ui'

export default function MessagesLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-1.5 h-4 w-48" />
      </div>

      <div className="flex h-[60vh] flex-col rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex-1 space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className={`flex ${i % 2 === 0 ? 'justify-start' : 'justify-end'}`}>
              <Skeleton className={`h-12 rounded-2xl ${i % 2 === 0 ? 'w-2/5' : 'w-1/3'}`} />
            </div>
          ))}
        </div>
        <Skeleton className="mt-4 h-11 w-full rounded-lg" />
      </div>
    </div>
  )
}
