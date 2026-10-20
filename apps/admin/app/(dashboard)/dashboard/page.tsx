import { Card, CardContent, CardDescription, CardHeader, CardTitle, Skeleton } from '@iha/ui'

export default function DashboardPage() {
  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle>Platform overview</CardTitle>
          <CardDescription>Monitor cases, users, and pending platform tasks.</CardDescription>
        </CardHeader>
        <CardContent className="space-y-3">
          <Skeleton className="h-24 w-full" />
          <Skeleton className="h-24 w-full" />
        </CardContent>
      </Card>
    </div>
  )
}
