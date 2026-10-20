import { Card, CardContent, CardHeader, Skeleton } from '@iha/ui'

export default function TreatmentPlanLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <div className="space-y-1.5">
          <Skeleton className="h-5 w-32" />
          <Skeleton className="h-4 w-40" />
        </div>
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="space-y-1.5">
              <Skeleton className="h-3 w-32" />
              <Skeleton className="h-20 w-full rounded-md" />
            </div>
          ))}
        </CardContent>
      </Card>

      <Skeleton className="h-10 w-36 rounded-md" />
    </div>
  )
}
