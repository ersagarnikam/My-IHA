import { useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { useToast } from '../../components/Toasts'
import { ErrorState, FormError, Loading } from '../../components/ui'
import { apiPost } from '../../lib/api'
import { useApi } from '../../lib/useApi'
import { BackHeader, formatDate, money, PillTabs, usePaged } from '../doctor/shared'
import { SPECIALIST_TYPE_LABELS, TREATMENT_TYPE_LABELS } from '../doctor/types'
import type { AdminOutletContext } from './AdminLayout'
import { Fact, ReasonDialog } from './DoctorPages'
import { Pill, PLAN_STATUS, type PlanDetail, type PlanRow } from './types'

type Tab =
  | 'submitted_to_iha'
  | 'presented_to_patient'
  | 'patient_confirmed'
  | 'rejected_by_iha'
  | 'all'

const TABS: { id: Tab; label: string }[] = [
  { id: 'submitted_to_iha', label: 'To Review' },
  { id: 'presented_to_patient', label: 'With Patient' },
  { id: 'patient_confirmed', label: 'Chosen & Paid' },
  { id: 'rejected_by_iha', label: 'Declined' },
  { id: 'all', label: 'All' },
]

export function AdminPlansPage() {
  const list = useApi<PlanRow[]>('/api/admin/plans')
  const [tab, setTab] = useState<Tab>('submitted_to_iha')
  const rows = (list.data ?? []).filter((p) => tab === 'all' || p.status === tab)
  const paged = usePaged(rows)
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />
  return (
    <div className="dr-page">
      <h1 className="dr-title">Treatment Plans</h1>
      <PillTabs
        tabs={TABS}
        active={tab}
        onChange={(t) => {
          setTab(t)
          paged.reset()
        }}
      />
      <section className="dr-card">
        <div className="dr-table-wrap">
          <table className="dr-table">
            <thead>
              <tr>
                <th>Case ID</th>
                <th>Doctor</th>
                <th>Procedure</th>
                <th>Hospital</th>
                <th>Submitted</th>
                <th>Plan total</th>
                <th>Status</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {paged.rows.length === 0 && (
                <tr>
                  <td colSpan={8} className="dr-empty-row">
                    No plans here.
                  </td>
                </tr>
              )}
              {paged.rows.map((p) => (
                <tr key={p.id}>
                  <td className="strong">{p.referenceNumber}</td>
                  <td>{p.doctorName}</td>
                  <td>{p.procedureName ?? '—'}</td>
                  <td>{p.hospitalName ?? '—'}</td>
                  <td>{formatDate(p.submittedAt)}</td>
                  <td>{money(p.totalAud)}</td>
                  <td>
                    <Pill map={PLAN_STATUS} value={p.status} />
                  </td>
                  <td>
                    <Link className="button dr-view" to={`/admin/plans/${p.id}`}>
                      {p.status === 'submitted_to_iha' ? 'Review' : 'View'}
                    </Link>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
        {paged.footer}
      </section>
    </div>
  )
}

export function AdminPlanDetailPage() {
  const { planId } = useParams()
  const toast = useToast()
  const { refreshCounts } = useOutletContext<AdminOutletContext>()
  const plan = useApi<PlanDetail>(`/api/admin/plans/${planId}`)
  const [commission, setCommission] = useState<string | null>(null)
  const [declineOpen, setDeclineOpen] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  if (plan.error) return <ErrorState error={plan.error} onRetry={plan.reload} />
  if (!plan.data) return <Loading />
  const p = plan.data
  const reviewable = p.status === 'submitted_to_iha' || p.status === 'iha_review_in_progress'
  const fee = commission ?? String(p.suggestedCommissionAud)
  const feeNumber = Number(fee)

  async function publish() {
    setPending(true)
    setError(null)
    try {
      plan.setData(
        await apiPost<PlanDetail>(`/api/admin/plans/${p.id}/publish`, {
          mtaCommissionAud: feeNumber,
        }),
      )
      toast({ title: 'Published. The patient can now see this treatment option.', tone: 'good' })
      refreshCounts()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="dr-page">
      <BackHeader
        to="/admin/plans"
        title={p.procedureName ?? 'Treatment plan'}
        subtitle={`Case ${p.referenceNumber} · ${p.doctorName} · submitted ${formatDate(p.submittedAt)}`}
      />

      <section className="dr-card row-between">
        <span>
          <Pill map={PLAN_STATUS} value={p.status} />{' '}
          <Link className="small" to={`/admin/cases/${p.caseId}`}>
            Open case
          </Link>
        </span>
        <strong>{money(p.totalAud)}</strong>
      </section>

      {p.rejectionReason && <div className="dr-banner bad">Declined: {p.rejectionReason}</div>}

      <section className="dr-card stack">
        <h2 className="dr-subtitle">Diagnosis &amp; treatment</h2>
        <div className="dr-kv">
          <Fact label="Diagnosis" value={p.diagnosis} className="full" />
          <Fact
            label="Treatment type"
            value={p.treatmentType ? TREATMENT_TYPE_LABELS[p.treatmentType] : null}
          />
          <Fact label="Technique" value={p.technique} />
          <Fact label="Success rate" value={p.successRate} />
          <Fact label="Description" value={p.description} className="full" />
          <Fact label="Expected outcome" value={p.expectedOutcome} className="full" />
        </div>
      </section>

      <section className="dr-card stack">
        <h2 className="dr-subtitle">Timeline &amp; hospital</h2>
        <div className="dr-kv">
          <Fact
            label="Dates"
            value={`${formatDate(p.treatmentStartDate)} – ${formatDate(p.treatmentEndDate)}`}
          />
          <Fact
            label="Duration"
            value={p.treatmentDurationDays ? `${p.treatmentDurationDays} days` : null}
          />
          <Fact label="Hospital stay" value={p.estimatedLengthOfStay} />
          <Fact label="Recovery" value={p.recoveryTime} />
          <Fact
            label="Hospital"
            value={p.hospitalName ? `${p.hospitalName}, ${p.hospitalCity}` : null}
          />
          <Fact
            label="Department / room"
            value={[p.department, p.roomCategory].filter(Boolean).join(' · ')}
          />
          <Fact label="Special requirements" value={p.specialRequirements} className="full" />
        </div>
      </section>

      <section className="dr-card stack">
        <h2 className="dr-subtitle">Costs</h2>
        <table className="dash-table">
          <tbody>
            <CostLine label="Doctor fees" amount={p.doctorFeesAud} />
            <CostLine label="Hospital fees" amount={p.hospitalFeesAud} />
            {p.costItems.map((i, idx) => (
              <CostLine key={idx} label={i.label} amount={i.amount} />
            ))}
            {p.specialists.map((s, idx) => (
              <CostLine
                key={`s${idx}`}
                label={`${SPECIALIST_TYPE_LABELS[s.specialistType] ?? s.specialistType}${s.specialistName ? ` (${s.specialistName})` : ''}`}
                amount={s.costAud}
              />
            ))}
            <tr>
              <td>
                <strong>Plan total (before MTA's fee)</strong>
              </td>
              <td style={{ textAlign: 'right' }}>
                <strong>{money(p.totalAud)}</strong>
              </td>
            </tr>
          </tbody>
        </table>
        {p.costNotes && (
          <p className="muted small" style={{ margin: 0 }}>
            Notes: {p.costNotes}
          </p>
        )}
      </section>

      {(p.patientInstructions || p.aftercare.length > 0) && (
        <section className="dr-card stack">
          <h2 className="dr-subtitle">Doctor notes</h2>
          {p.patientInstructions && (
            <p className="prewrap" style={{ margin: 0 }}>
              {p.patientInstructions}
            </p>
          )}
          {p.aftercare.length > 0 && (
            <ul style={{ margin: 0 }}>
              {p.aftercare.map((a, i) => (
                <li key={i}>{a}</li>
              ))}
            </ul>
          )}
        </section>
      )}

      {reviewable && (
        <section className="dr-card stack">
          <h2 className="dr-subtitle">Decision</h2>
          <label className="field" style={{ maxWidth: '20rem' }}>
            <span className="field-label">MTA service fee (AUD)</span>
            <input
              type="number"
              min={0}
              step="1"
              value={fee}
              onChange={(e) => setCommission(e.target.value)}
            />
            <span className="field-hint">
              Suggested: 10% of the plan total. The patient sees it as "IHA Service Fee".
            </span>
          </label>
          <p style={{ margin: 0 }}>
            Patient pays{' '}
            <strong>{money(p.totalAud + (Number.isFinite(feeNumber) ? feeNumber : 0))}</strong> in
            total.
          </p>
          <FormError error={error} />
          <div className="dr-actions">
            <button
              type="button"
              disabled={pending || !(feeNumber >= 0) || fee === ''}
              onClick={publish}
            >
              {pending ? 'Publishing…' : 'Approve and send to patient'}
            </button>
            <button type="button" className="button-danger" onClick={() => setDeclineOpen(true)}>
              Decline
            </button>
          </div>
        </section>
      )}

      <ReasonDialog
        open={declineOpen}
        title="Decline treatment plan"
        description="The doctor sees your reason. The plan can't be edited afterwards; the doctor can discuss it with MTA in Messages."
        confirmLabel="Decline plan"
        danger
        onClose={() => setDeclineOpen(false)}
        onConfirm={async (reason) => {
          plan.setData(await apiPost<PlanDetail>(`/api/admin/plans/${p.id}/reject`, { reason }))
          toast({ title: 'Plan declined. The doctor has been notified.', tone: 'good' })
          setDeclineOpen(false)
          refreshCounts()
        }}
      />
    </div>
  )
}

function CostLine({ label, amount }: { label: string; amount: number | null }) {
  return (
    <tr>
      <td>{label}</td>
      <td style={{ textAlign: 'right' }}>{money(amount)}</td>
    </tr>
  )
}
