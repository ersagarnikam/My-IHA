import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import { CaseTabs } from '@iha/ui'
import { getAccountForUser } from '@/lib/auth/account'
import { fetchCasesForLawyer, type LawyerCaseListItem } from '@/lib/data/cases'
import { VisaCasesTable } from '@/components/cases/visa-cases-table'
import { getVisaStatusBucket } from '@/components/cases/visa-status-badge'

// Same real, already-shipped visa_submissions.status buckets as
// visa-status-badge.tsx — see the Status Model Conflict note in
// visa-lawyer-portal/03-visa-case-management.md.
const TABS = [
  { key: 'all', label: 'All' },
  { key: 'new', label: 'New' },
  { key: 'under_review', label: 'Under Review' },
  { key: 'docs_pending', label: 'Docs Pending' },
  { key: 'in_progress', label: 'In Progress' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
] as const

function matchesStatusTab(tabKey: string, c: LawyerCaseListItem): boolean {
  return tabKey === 'all' || getVisaStatusBucket(c.status) === tabKey
}

function buildHref(status: string) {
  return status === 'all' ? '/visa-cases' : `/visa-cases?status=${status}`
}

export default async function VisaCasesPage({
  searchParams,
}: {
  searchParams: Promise<{ status?: string }>
}) {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')

  const { status } = await searchParams
  const { data: cases } = await fetchCasesForLawyer(account.id)

  const activeTab = TABS.find((t) => t.key === status) ?? TABS[0]
  const filtered = cases.filter((c) => matchesStatusTab(activeTab.key, c))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Visa Cases</h1>
        <p className="mt-0.5 text-sm text-slate-500">Cases assigned to you for visa processing.</p>
      </div>

      <CaseTabs
        activeKey={activeTab.key}
        tabs={TABS.map((tab) => ({ key: tab.key, label: tab.label, href: buildHref(tab.key) }))}
      />

      <VisaCasesTable cases={filtered} />
    </div>
  )
}
