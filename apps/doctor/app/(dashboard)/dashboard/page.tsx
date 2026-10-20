import Link from 'next/link'
import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import { fetchAssignedCasesStats, fetchAssignmentsForDoctor } from '@iha/db/case-assignments'
import { fetchConsultationRequestsForDoctor } from '@iha/db/consultations'
import { fetchConfirmedTreatmentsForDoctor } from '@iha/db/treatments'
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
import {
  CalendarDays,
  FileSearch,
  FileText,
  Layers,
  MessageSquare,
  UserCheck,
} from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { getAccountForUser } from '@/lib/auth/account'
import { formatZonedDateTime, DOCTOR_TIME_ZONE } from '@/lib/timezone'

function formatDate(iso: string | null) {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function StatCard({
  label,
  value,
  note,
  icon: Icon,
}: {
  label: string
  value: string | number
  note?: string
  icon: LucideIcon
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

  const [{ data: stats }, { data: assignments }, { data: consultationRequests }, { data: confirmedTreatments }] = await Promise.all([
    fetchAssignedCasesStats(account.id),
    fetchAssignmentsForDoctor(account.id),
    fetchConsultationRequestsForDoctor(account.id),
    fetchConfirmedTreatmentsForDoctor(account.id),
  ])
  const recentAssignments = assignments.slice(0, 5)

  const upcomingTreatments = confirmedTreatments
    .filter((o) => o.treatment_start_date)
    .sort((a, b) => (a.treatment_start_date as string).localeCompare(b.treatment_start_date as string))
    .slice(0, 5)

  const now = Date.now()
  const upcomingConsultations = consultationRequests
    .filter((r) => r.status === 'scheduled')
    .map((r) => ({ ...r, selectedSlot: r.slots.find((s) => s.id === r.selected_slot_id) }))
    .filter((r): r is typeof r & { selectedSlot: NonNullable<typeof r.selectedSlot> } =>
      Boolean(r.selectedSlot && new Date(r.selectedSlot.slot_time).getTime() > now),
    )
    .sort((a, b) => a.selectedSlot.slot_time.localeCompare(b.selectedSlot.slot_time))
    .slice(0, 5)

  return (
    <div className="space-y-6">
      <h1 className="text-lg font-semibold text-slate-900">Welcome, {account.displayName}</h1>
      <div>
        <p className="text-base font-semibold leading-none tracking-tight text-slate-900">
          Quick Actions
        </p>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Link href="/cases">
          <Card className="h-full transition hover:border-cyan-300 hover:shadow-sm">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-6 text-center">
              <FileText className="h-6 w-6 text-cyan-700" />
              <p className="text-sm font-medium text-slate-900">View All Cases</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/consultations">
          <Card className="h-full transition hover:border-cyan-300 hover:shadow-sm">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-6 text-center">
              <CalendarDays className="h-6 w-6 text-cyan-700" />
              <p className="text-sm font-medium text-slate-900">View All Consultations</p>
            </CardContent>
          </Card>
        </Link>
        <Link href="/messages">
          <Card className="h-full transition hover:border-cyan-300 hover:shadow-sm">
            <CardContent className="flex flex-col items-center justify-center gap-2 py-6 text-center">
              <MessageSquare className="h-6 w-6 text-cyan-700" />
              <p className="text-sm font-medium text-slate-900">Chat with Admin</p>
            </CardContent>
          </Card>
        </Link>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <StatCard label="Assigned Cases" value={stats.assigned} icon={FileText} />
        <StatCard label="Pending Review" value={stats.pendingReview} icon={FileSearch} />
        <StatCard label="Plans Created" value={stats.plansCreated} icon={Layers} />
        <StatCard label="Completed Cases" value={stats.completed} icon={UserCheck} />
      </div>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Upcoming Consultations</CardTitle>
            <Link href="/consultations" className="text-sm font-medium text-cyan-700 hover:underline">
              View All
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {upcomingConsultations.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-slate-500">
              <CalendarDays className="h-6 w-6 text-slate-300" />
              <p className="text-sm">No upcoming consultations scheduled.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-300 text-xs uppercase text-slate-400 hover:bg-transparent">
                  <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                    Patient Name
                  </TableHead>
                  <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                    Case ID
                  </TableHead>
                  <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                    Scheduled Time
                  </TableHead>
                  <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingConsultations.map((r) => {
                  const { date, range } = formatZonedDateTime(r.selectedSlot.slot_time, r.selectedSlot.slot_end_time)
                  return (
                    <TableRow key={r.id} className="border-slate-200 hover:bg-transparent">
                      <TableCell className="py-3 pr-4 font-medium text-slate-900">
                        {r.patient_name ?? '—'}
                      </TableCell>
                      <TableCell className="py-3 pr-4 text-slate-600">
                        {r.case_reference_number ?? '—'}
                      </TableCell>
                      <TableCell className="py-3 pr-4 text-slate-600">
                        {date}, {range} ({DOCTOR_TIME_ZONE.split('/').pop()?.replace(/_/g, ' ')} Time)
                      </TableCell>
                      <TableCell className="py-3 pr-4">
                        <Link
                          href={`/consultations/${r.id}`}
                          className="inline-flex h-8 items-center rounded-md bg-cyan-700 px-3 text-xs font-medium text-white hover:bg-cyan-800"
                        >
                          View
                        </Link>
                      </TableCell>
                    </TableRow>
                  )
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Upcoming Treatments</CardTitle>
            <Link href="/cases" className="text-sm font-medium text-cyan-700 hover:underline">
              View All
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {upcomingTreatments.length === 0 ? (
            <div className="flex flex-col items-center gap-2 py-8 text-center text-slate-500">
              <CalendarDays className="h-6 w-6 text-slate-300" />
              <p className="text-sm">No confirmed treatments scheduled.</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow className="border-slate-300 text-xs uppercase text-slate-400 hover:bg-transparent">
                  <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                    Patient Name
                  </TableHead>
                  <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                    Case ID
                  </TableHead>
                  <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                    Start Date
                  </TableHead>
                  <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                    End Date
                  </TableHead>
                  <TableHead className="h-auto py-2 pr-4 text-xs font-medium uppercase text-slate-400">
                    Action
                  </TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {upcomingTreatments.map((o) => (
                  <TableRow key={o.id} className="border-slate-200 hover:bg-transparent">
                    <TableCell className="py-3 pr-4 font-medium text-slate-900">
                      {o.cases.patients?.full_name ?? '—'}
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-slate-600">
                      {o.cases.reference_number}
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-slate-600">
                      {formatDate(o.treatment_start_date)}
                    </TableCell>
                    <TableCell className="py-3 pr-4 text-slate-600">
                      {formatDate(o.treatment_end_date)}
                    </TableCell>
                    <TableCell className="py-3 pr-4">
                      <Link
                        href={`/cases/${o.case_id}/treatment-plan`}
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

      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Cases</CardTitle>
            <Link href="/cases" className="text-sm font-medium text-cyan-700 hover:underline">
              View All
            </Link>
          </div>
        </CardHeader>
        <CardContent>
          {recentAssignments.length === 0 ? (
            <p className="py-8 text-center text-sm text-slate-500">No cases assigned yet.</p>
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
                        href={`/cases/${a.case_id}`}
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
