import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@iha/ui'
import { CheckCircle2, Clock3, FileText } from 'lucide-react'
import { getAccountForUser } from '@/lib/auth/account'
import { fetchCasesForLawyer } from '@/lib/data/cases'
import { VisaStatusBadge, getVisaStatusBucket } from '@/components/cases/visa-status-badge'

function StatCard({
  label,
  value,
  icon: Icon,
}: {
  label: string
  value: string | number
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 pt-6">
        <div>
          <p className="text-sm font-medium text-slate-900">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
        </div>
        <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-cyan-700 text-white">
          <Icon className="h-5 w-5" />
        </div>
      </CardContent>
    </Card>
  )
}

export default async function DashboardPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')

  const { data: cases } = await fetchCasesForLawyer(account.id)

  const newCount = cases.filter((c) => getVisaStatusBucket(c.status) === 'new').length
  const inProgressCount = cases.filter((c) => getVisaStatusBucket(c.status) === 'in_progress').length
  const approvedCount = cases.filter((c) => getVisaStatusBucket(c.status) === 'approved').length
  const recentCases = cases.slice(0, 5)

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Welcome, {account.displayName}</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="New Cases" value={newCount} icon={FileText} />
        <StatCard label="In Progress" value={inProgressCount} icon={Clock3} />
        <StatCard label="Approved" value={approvedCount} icon={CheckCircle2} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Cases</CardTitle>
            <Link href="/visa-cases" className="text-sm font-medium text-cyan-700 hover:underline">
              View All
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentCases.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No cases yet.</p>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-300 text-xs uppercase text-slate-400 hover:bg-transparent">
                  <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                    Case ID
                  </TableHead>
                  <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                    Patient Name
                  </TableHead>
                  <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                    Country
                  </TableHead>
                  <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                    Status
                  </TableHead>
                  <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {recentCases.map((c) => (
                  <TableRow key={c.id} className="border-slate-200 hover:bg-transparent">
                    <TableCell className="py-3 pr-4 font-medium text-slate-900">
                      {c.cases?.reference_number ?? '—'}
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-slate-600">
                      {c.patients?.full_name ?? '—'}
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-slate-600">
                      {c.patients?.country_of_residence ?? '—'}
                    </TableCell>
                    <TableCell className="py-3 pr-4">
                      <VisaStatusBadge status={c.status} />
                    </TableCell>
                    <TableCell className="py-3 pr-4">
                      <Link
                        href={`/visa-cases/${c.case_id}`}
                        className="inline-flex h-8 items-center rounded-md bg-cyan-700 px-3 text-xs font-medium text-white hover:bg-cyan-800"
                      >
                        View
                      </Link>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
