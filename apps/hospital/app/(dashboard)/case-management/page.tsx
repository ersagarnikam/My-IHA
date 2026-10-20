import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import { getAccountForUser } from '@/lib/auth/account'
import { fetchAssignmentsForHospitalDoctors, type AssignmentWithCaseAndDoctor } from '@/lib/data/case-management'
import { CaseTabs, CaseDateFilter, CaseAssignmentsTable } from '@iha/ui'

// Unlike the doctor's My Cases page (apps/hospital/app/(dashboard)/cases/page.tsx),
// a hospital never has access to a case before a doctor's treatment plan for
// it leaves draft (see hospital_has_access_to_assignment,
// packages/db/supabase/migrations/20260730060000) — so the doctor-side
// New/Under Review/Plan Sent granularity never actually applies here; every
// case the hospital can see is already at least "with IHA/the patient".
// Four buckets cover the hospital's real decision points: is the patient
// still the one who needs to act, did they confirm and pay, is the doctor
// done, or did IHA reject the plan outright.
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'awaiting_patient', label: 'Awaiting Patient' },
  { key: 'treatment_confirmed', label: 'Treatment Confirmed' },
  { key: 'completed', label: 'Completed' },
  { key: 'declined', label: 'Declined' },
] as const

const TREATMENT_CONFIRMED_STATUSES = new Set([
  'payment_confirmed',
  'visa_documents_submitted',
  'visa_processing',
  'travel_ready',
])

function matchesStatusTab(tabKey: string, a: AssignmentWithCaseAndDoctor): boolean {
  const caseStatus = a.cases?.status
  // A visa rejection is a terminal negative outcome like the other two below —
  // without this, it fell through TREATMENT_CONFIRMED_STATUSES and landed in
  // "Awaiting Patient", which is wrong: the case isn't waiting on anything.
  const declined = a.treatmentPlanStatus === 'rejected_by_iha' || a.status === 'cancelled' || caseStatus === 'visa_rejected'
  switch (tabKey) {
    case 'declined':
      return declined
    case 'treatment_confirmed':
      return !declined && !!caseStatus && TREATMENT_CONFIRMED_STATUSES.has(caseStatus)
    case 'completed':
      return !declined && caseStatus === 'completed'
    case 'awaiting_patient':
      return !declined && caseStatus !== 'completed' && !(caseStatus && TREATMENT_CONFIRMED_STATUSES.has(caseStatus))
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
  return qs ? `/case-management?${qs}` : '/case-management'
}

export default async function CaseManagementPage({
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
  if (account.role !== 'hospital') redirect('/cases')

  const { status, range } = await searchParams
  const { data: assignments } = await fetchAssignmentsForHospitalDoctors(account.id)

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
        <h1 className="text-lg font-semibold text-slate-900">Case Management</h1>
        <p className="mt-0.5 text-sm text-slate-500">Cases assigned to your hospital by affiliated doctors.</p>
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
        showDoctorColumn
        viewHrefBase="/case-management"
        viewHrefDisambiguateAssignment
        searchPlaceholder="Search patient, doctor, or case ID"
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
