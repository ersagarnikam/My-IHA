import { Card, CardContent, Skeleton } from '@iha/ui'

function TableRowSkeleton({ columns }: { columns: number }) {
  return (
    <div className="flex items-center gap-4 border-b border-slate-100 py-3 last:border-0">
      {Array.from({ length: columns }).map((_, i) => (
        <Skeleton key={i} className="h-4 flex-1" />
      ))}
    </div>
  )
}

export default function VisaCasesLoading() {
  return (
    <div className="space-y-6">
      <div>
        <Skeleton className="h-5 w-24" />
        <Skeleton className="mt-1.5 h-4 w-64" />
      </div>

      <div className="flex flex-wrap gap-2">
        {Array.from({ length: 7 }).map((_, i) => (
          <Skeleton key={i} className="h-7 w-24 rounded-full" />
        ))}
      </div>

      <Card>
        <CardContent className="pt-6">
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
