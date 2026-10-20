import { Card, CardContent, CardHeader, Skeleton } from '@iha/ui'

export default function AccountSettingsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-5 w-40" />
        <Skeleton className="mt-1.5 h-4 w-56" />
      </div>

      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 6 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-40" />
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 sm:grid-cols-2">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="space-y-1.5">
                <Skeleton className="h-3 w-24" />
                <Skeleton className="h-9 w-full rounded-md" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Skeleton className="h-10 w-32 rounded-md" />
    </div>
  )
}
