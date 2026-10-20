import { Card, CardContent, CardHeader, Skeleton } from '@iha/ui'

function TableRowSkeleton({ columns }: { columns: number }) {
  return (
    <div className="flex items-center gap-4 border-b border-slate-100 py-3 last:border-0">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>
  )
}

export default function DocumentsLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-5 w-28" />
        <Skeleton className="mt-1.5 h-4 w-80" />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-end">
            <Skeleton className="h-9 w-56 rounded-md" />
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex gap-4 border-b border-slate-200 pb-2">
            {Array.from({ length: 5 }).map((_, i) => (
              <Skeleton key={i} className="h-3 flex-1" />
            ))}
          </div>
          {Array.from({ length: 6 }).map((_, i) => (
            <TableRowSkeleton key={i} columns={5} />
          ))}
        </CardContent>
      </Card>
    </div>
  )
}
