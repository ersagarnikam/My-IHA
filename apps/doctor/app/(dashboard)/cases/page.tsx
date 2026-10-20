import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import { fetchAssignmentsForDoctor, type AssignmentWithCase } from '@iha/db/case-assignments'
import { fetchTreatmentPlanStatusesForDoctor } from '@iha/db/treatment-plans'
import { getAccountForUser } from '@/lib/auth/account'
import { CaseTabs, CaseDateFilter, CaseAssignmentsTable } from '@iha/ui'

type AssignmentRow = AssignmentWithCase & { treatmentPlanStatus?: string | null }

// "New"/"Under Review" are keyed off the doctor's own assignment response,
// not just the case's status — a case can sit at `evaluation` for multiple
// invited doctors, only one of whom has actually accepted it. The other
// tabs track the case's shared lifecycle once a doctor is actively on it.
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'plan_sent', label: 'Plan Sent' },
  { key: 'plan_confirmed', label: 'Plan Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'declined', label: 'Declined' },
] as const

const PLAN_CONFIRMED_STATUSES = new Set([
  'payment_confirmed',
  'visa_documents_submitted',
  'visa_processing',
  'travel_ready',
])

function matchesStatusTab(tabKey: string, a: AssignmentRow): boolean {
  const caseStatus = a.cases?.status
  // A visa rejection and an IHA-rejected plan are both terminal negative
  // outcomes like the assignment-level ones below, even though neither is
  // driven by a.status: a visa rejection is carried on the case, and a plan
  // rejection doesn't move cases.status at all (see CaseRowStatusBadge) — so
  // without this a rejected plan would keep sitting in whatever tab its
  // still-stale caseStatus implies instead of "Declined".
  const declined =
    a.status === 'declined' ||
    a.status === 'withdrawn' ||
    a.status === 'cancelled' ||
    caseStatus === 'visa_rejected' ||
    a.treatmentPlanStatus === 'rejected_by_iha'
  switch (tabKey) {
    case 'new':
      return !declined && a.status === 'invited'
    case 'under_review':
      return !declined && a.status === 'accepted' && (caseStatus === 'doctor_assigned' || caseStatus === 'evaluation')
    case 'plan_sent':
      return !declined && caseStatus === 'treatment_plan'
    case 'plan_confirmed':
      return !declined && !!caseStatus && PLAN_CONFIRMED_STATUSES.has(caseStatus)
    case 'completed':
      return !declined && caseStatus === 'completed'
    case 'declined':
      return declined
    default:
      return true
  }
}

const RANGES = [
  { key: 'all', label: 'All Time', days: null },
  { key: '7', label: 'Last 7 Days', days: 7 },
  { key: '30', label: 'Last 30 Days', days: 30 },
  { key: '90', label: 'Last 90 Days', days: 90 },
] as const

function buildHref(params: { status?: string; range?: string }) {
  const sp = new URLSearchParams()
  if (params.status && params.status !== 'all') sp.set('status', params.status)
  if (params.range && params.range !== 'all') sp.set('range', params.range)
  const qs = sp.toString()
  return qs ? `/cases?${qs}` : '/cases'
}

export default async function CasesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string; range?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')

  if (account.role === 'hospital') redirect('/case-management')

  const { status, range } = await searchParams
  const [{ data: rawAssignments }, { data: planStatuses }] = await Promise.all([
    fetchAssignmentsForDoctor(account.id),
    fetchTreatmentPlanStatusesForDoctor(account.id),
  ])
  const statusByCase = new Map(planStatuses.map((p) => [p.case_id, p.status]))
  const assignments: AssignmentRow[] = rawAssignments.map((a) => ({
    ...a,
    treatmentPlanStatus: statusByCase.get(a.case_id) ?? null,
  }))

  const activeTab = TABS.find((t) => t.key === status) ?? TABS[0]
  const activeRange = RANGES.find((r) => r.key === range) ?? RANGES[0]
  const rangeCutoff = activeRange.days ? Date.now() - activeRange.days * 24 * 60 * 60 * 1000 : null

  const filtered = assignments.filter((a) => {
    const matchesTab = matchesStatusTab(activeTab.key, a)
    const matchesRange = rangeCutoff
      ? !!a.cases?.created_at && new Date(a.cases.created_at).getTime() >= rangeCutoff
      : true
    return matchesTab && matchesRange
  })

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">My Cases</h1>
      </div>

      <CaseTabs
        activeKey={activeTab.key}
        tabs={TABS.map((tab) => ({
          key: tab.key,
          label: tab.label,
          href: buildHref({ status: tab.key, range }),
        }))}
      />

      <CaseAssignmentsTable
        assignments={filtered}
        viewHrefBase="/cases"
        searchPlaceholder="Search"
        extraFilter={
          <CaseDateFilter
            value={activeRange.key}
            options={RANGES.map((r) => ({
              value: r.key,
              label: r.label,
              href: buildHref({ status: activeTab.key, range: r.key }),
            }))}
          />
        }
      />
    </div>
  )
}
