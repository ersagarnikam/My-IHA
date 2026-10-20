import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import { fetchConsultationRequestsForDoctor, type ConsultationRequestWithContext } from '@iha/db/consultations'
import { getAccountForUser } from '@/lib/auth/account'
import { CaseTabs } from '@iha/ui'
import { ConsultationsTable } from '@/components/consultations/consultations-table'

const TABS = [
  { key: 'all', label: 'All' },
  { key: 'awaiting_slots', label: 'Awaiting Slots' },
  { key: 'awaiting_confirmation', label: 'Awaiting Patient Confirmation' },
  { key: 'scheduled', label: 'Scheduled' },
  { key: 'cancelled', label: 'Cancelled' },
] as const

function matchesStatusTab(tabKey: string, request: ConsultationRequestWithContext): boolean {
  switch (tabKey) {
    case 'awaiting_slots':
      return request.status === 'requested'
    case 'awaiting_confirmation':
      return request.status === 'slots_proposed' || request.status === 'slot_selected'
    case 'scheduled':
      return request.status === 'scheduled'
    case 'cancelled':
      return request.status === 'cancelled'
    default:
      return true
  }
}

function buildHref(params: { status?: string }) {
  const sp = new URLSearchParams()
  if (params.status && params.status !== 'all') sp.set('status', params.status)
  const qs = sp.toString()
  return qs ? `/consultations?${qs}` : '/consultations'
}

export default async function ConsultationsPage({
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

  if (account.role === 'hospital') redirect('/dashboard')

  const { status } = await searchParams
  const { data: requests, error: fetchError } = await fetchConsultationRequestsForDoctor(account.id)

  const activeTab = TABS.find((t) => t.key === status) ?? TABS[0]
  const filtered = requests.filter((r) => matchesStatusTab(activeTab.key, r))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Consultations</h1>
      </div>

      <CaseTabs
        activeKey={activeTab.key}
        tabs={TABS.map((tab) => ({
          key: tab.key,
          label: tab.label,
          href: buildHref({ status: tab.key }),
        }))}
      />

      {fetchError ? (
        <p className="py-8 text-center text-sm text-red-600">
          Couldn&apos;t load consultation requests: {fetchError}
        </p>
      ) : (
        <ConsultationsTable requests={filtered} />
      )}
    </div>
  )
}
