import { useState } from 'react'
import { FormError } from '../../components/ui'
import { apiPost } from '../../lib/api'
import { isAtOrAfter, type CaseDetail } from '../../lib/cases'
import type { CaseVisa, Consultation } from '../../lib/types'

// Development only (stripped from production builds): plays the admin, doctor
// and hospital roles via /api/dev/* until their portals are ported.

export function DevCasePanel({
  detail,
  consultations,
  visa,
  onChanged,
}: {
  detail: CaseDetail
  consultations: Consultation[]
  visa: CaseVisa | null
  onChanged: () => void
}) {
  if (!import.meta.env.DEV) return null
  const requested = consultations.filter((c) => c.status === 'requested')
  const lettersMissing =
    isAtOrAfter(detail.status, 'payment_confirmed') && visa && !visa.lettersReady
  const actions: { label: string; path: string }[] = []
  if (!isAtOrAfter(detail.status, 'treatment_plan'))
    actions.push({
      label: 'Publish two treatment options (admin/doctors)',
      path: `/api/dev/cases/${detail.id}/treatment-options`,
    })
  for (const c of requested)
    actions.push({
      label: 'Propose consultation times (doctor)',
      path: `/api/dev/consultations/${c.id}/propose-slots`,
    })
  if (lettersMissing)
    actions.push({
      label: 'Send hospital letters (hospital)',
      path: `/api/dev/cases/${detail.id}/hospital-letters`,
    })
  if (!actions.length) return null
  return <DevActions actions={actions} onChanged={onChanged} />
}

export function DevChatPanel({ closed, onChanged }: { closed: boolean; onChanged: () => void }) {
  if (!import.meta.env.DEV || !closed) return null
  return (
    <DevActions
      actions={[{ label: 'Open chat as coordinator (admin)', path: '/api/dev/chat/open' }]}
      onChanged={onChanged}
    />
  )
}

export function DevActions({
  actions,
  onChanged,
}: {
  actions: { label: string; path: string }[]
  onChanged: () => void
}) {
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  return (
    <section className="card stack dev-panel">
      <p className="small">
        <strong>Dev simulation</strong> — stands in for roles whose portals aren't ported yet.
      </p>
      <div className="actions">
        {actions.map((a) => (
          <button
            key={a.path}
            type="button"
            className="button-secondary"
            disabled={pending}
            onClick={async () => {
              setPending(true)
              setError(null)
              try {
                await apiPost(a.path)
                onChanged()
              } catch (err) {
                setError(err)
              } finally {
                setPending(false)
              }
            }}
          >
            {a.label}
          </button>
        ))}
      </div>
      <FormError error={error} />
    </section>
  )
}
