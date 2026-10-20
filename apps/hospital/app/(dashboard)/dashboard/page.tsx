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
  CaseRowStatusBadge,
} from '@iha/ui'
import { FileText, Stethoscope, Users } from 'lucide-react'
import { getAccountForUser } from '@/lib/auth/account'
import { fetchAffiliatedDoctors } from '@/lib/data/doctor-management'
import { fetchPatientsForHospitalDoctors } from '@/lib/data/patient-management'
import { fetchAssignmentsForHospitalDoctors } from '@/lib/data/case-management'

function StatCard({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string
  value: string | number
  note?: string
  icon: React.ComponentType<{ className?: string }>
}) {
  return (
    <Card>
      <CardContent className="flex items-center justify-between gap-4 pt-6">
        <div>
          <p className="text-sm font-medium text-slate-900">{label}</p>
          <p className="mt-1 text-2xl font-semibold text-slate-900">{value}</p>
          {note && <p className="mt-1 text-xs text-slate-400">{note}</p>}
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

  const [{ data: doctors }, { data: patients }, { data: assignments }] = await Promise.all([
    fetchAffiliatedDoctors(account.id),
    fetchPatientsForHospitalDoctors(account.id),
    fetchAssignmentsForHospitalDoctors(account.id),
  ])
  const caseCount = new Set(assignments.map((a) => a.case_id)).size
  const recentAssignments = assignments.slice(0, 5)

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Welcome, {account.displayName}</h1>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/doctor-management">
          <Card className="h-full transition hover:border-cyan-300 hover:shadow-sm">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-6 text-center">
              <Stethoscope className="h-6 w-6 text-cyan-700" />
              <p className="text-sm font-medium text-slate-900">Doctor Management</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/patient-management">
          <Card className="h-full transition hover:border-cyan-300 hover:shadow-sm">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-6 text-center">
              <Users className="h-6 w-6 text-cyan-700" />
              <p className="text-sm font-medium text-slate-900">Patient Management</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/case-management">
          <Card className="h-full transition hover:border-cyan-300 hover:shadow-sm">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-6 text-center">
              <FileText className="h-6 w-6 text-cyan-700" />
              <p className="text-sm font-medium text-slate-900">Case Management</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <StatCard label="Affiliated Doctors" value={doctors.length} icon={Stethoscope} />
        <StatCard label="Patients" value={patients.length} icon={Users} />
        <StatCard label="Total Cases" value={caseCount} icon={FileText} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Cases</CardTitle>
            <Link href="/case-management" className="text-sm font-medium text-cyan-700 hover:underline">
              View All
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentAssignments.length === 0 ? (
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
                    Doctor
                  </TableHead>
                  <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                    Condition
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
                {recentAssignments.map((a) => (
                  <TableRow key={a.id} className="border-slate-200 hover:bg-transparent">
                    <TableCell className="py-3 pr-4 font-medium text-slate-900">
                      {a.cases?.reference_number ?? '—'}
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-slate-600">
                      {a.cases?.patients?.full_name ?? '—'}
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-slate-600">{a.doctors?.full_name ?? '—'}</TableCell>
                    <TableCell className="py-3 pr-4 text-slate-600">
                      {a.cases?.specialty_other || a.cases?.specialty || '—'}
                    </TableCell>
                    <TableCell className="py-3 pr-4">
                      {a.cases && (
                        <CaseRowStatusBadge
                          assignmentStatus={a.status}
                          caseStatus={a.cases.status}
                          planSubmittedAt={a.plan_submitted_at}
                        />
                      )}
                    </TableCell>
                    <TableCell className="py-3 pr-4">
                      <Link
                        href={`/case-management/${a.case_id}?assignmentId=${a.id}`}
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
