import { Card, CardContent, CardHeader, Skeleton } from '@iha/ui'

export default function ConsultationDetailLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <Skeleton className="h-5 w-44" />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center justify-between gap-3 p-4">
          <div className="space-y-1.5">
            <Skeleton className="h-4 w-32" />
            <Skeleton className="h-4 w-40" />
          </div>
          <Skeleton className="h-5 w-24 rounded-full" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-28" />
        </CardHeader>
        <CardContent className="space-y-2">
          {Array.from({ length: 3 }).map((_, i) => (
            <Skeleton key={i} className="h-10 w-full rounded-lg" />
          ))}
        </CardContent>
      </Card>

      <Skeleton className="h-32 w-full rounded-lg" />

      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-32 rounded-md" />
      </div>
    </div>
  )
}
