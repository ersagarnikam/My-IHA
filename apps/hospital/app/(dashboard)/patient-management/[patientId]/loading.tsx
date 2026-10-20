import { Card, CardContent, CardHeader, Skeleton } from '@iha/ui'

function Field() {
  return (
    <div className="space-y-1.5">
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-4 w-28" />
    </div>
  )
}

export default function PatientDetailLoading() {
  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Skeleton className="h-9 w-9 shrink-0 rounded-full" />
        <Skeleton className="h-5 w-36" />
      </div>

      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          <Skeleton className="h-12 w-12 shrink-0 rounded-full" />
          <Skeleton className="h-4 w-32" />
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-32" />
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Field />
            <Field />
            <Field />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-36" />
        </CardHeader>
        <CardContent className="space-y-4">
          <Skeleton className="h-3 w-full" />
          <Skeleton className="h-3 w-2/3" />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field />
            <Field />
            <Field />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <Skeleton className="h-4 w-16" />
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-slate-100">
            {Array.from({ length: 3 }).map((_, i) => (
              <div key={i} className="flex items-center justify-between gap-4 py-3">
                <div className="space-y-1.5">
                  <Skeleton className="h-4 w-24" />
                  <Skeleton className="h-3 w-32" />
                </div>
                <Skeleton className="h-5 w-20 rounded-full" />
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
