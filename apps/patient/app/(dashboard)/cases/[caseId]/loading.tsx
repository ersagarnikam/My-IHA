import { Skeleton } from '@iha/ui'

function SectionSkeleton({ titleWidth = 'w-40', children }: { titleWidth?: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-slate-200 bg-white p-5">
      <Skeleton className={`mb-4 h-4 ${titleWidth}`} />
      {children}
    </section>
  )
}

export default function CaseDetailLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="mb-3 h-4 w-16" />
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div className="space-y-2">
            <div className="flex items-center gap-3">
              <Skeleton className="h-6 w-32" />
              <Skeleton className="h-5 w-24 rounded-full" />
            </div>
            <Skeleton className="h-4 w-40" />
            <Skeleton className="h-3 w-32" />
          </div>
        </div>
      </div>

      <div className="grid gap-5 lg:grid-cols-[1fr_340px]">
        <div className="min-w-0 space-y-5">
          <SectionSkeleton titleWidth="w-44">
            <div className="grid gap-3 sm:grid-cols-2">
              {Array.from({ length: 2 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full rounded-lg" />
              ))}
            </div>
          </SectionSkeleton>

          <SectionSkeleton titleWidth="w-52">
            <div className="space-y-2">
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-full" />
              <Skeleton className="h-3 w-2/3" />
            </div>
          </SectionSkeleton>

          <SectionSkeleton titleWidth="w-36">
            <Skeleton className="h-24 w-full rounded-lg" />
          </SectionSkeleton>
        </div>

        <aside className="rounded-xl border border-slate-200 bg-white p-5">
          <Skeleton className="mb-4 h-4 w-32" />
          <div className="space-y-4">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="flex items-start gap-3">
                <Skeleton className="h-6 w-6 shrink-0 rounded-full" />
                <div className="min-w-0 flex-1 space-y-1.5">
                  <Skeleton className="h-3.5 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  )
}
