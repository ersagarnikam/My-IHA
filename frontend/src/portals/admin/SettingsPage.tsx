import { useState } from 'react'
import { useToast } from '../../components/Toasts'
import { ErrorState, FormError, Loading } from '../../components/ui'
import { apiPut } from '../../lib/api'
import { useFormat } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { BusinessSettingsCard } from './BusinessSettings'
import type { FeeSetting, FeeSettings } from './types'

const GROUPS: { id: FeeSetting['group']; title: string; intro: string }[] = [
  {
    id: 'doctors',
    title: 'Doctors',
    intro:
      'Charged by card in the doctor portal. Doctors already registered keep their renewal date.',
  },
  {
    id: 'lawyers',
    title: 'Visa lawyers',
    intro:
      "Saved now and charged once the visa lawyer portal launches. Leave at $0 if lawyers shouldn't pay.",
  },
  {
    id: 'hospitals',
    title: 'Hospitals',
    intro:
      "Saved now and charged once the hospital portal launches. Leave at $0 if hospitals shouldn't pay.",
  },
  {
    id: 'patients',
    title: 'Patients & MTA service fee',
    intro: 'What patients pay MTA on top of treatment costs.',
  },
]

const audFormat = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })

export function formatFee(fee: Pick<FeeSetting, 'unit'>, amount: number | null) {
  if (amount === null) return '—'
  return fee.unit === 'percent' ? `${amount}%` : audFormat.format(amount)
}

/** Platform fees MTA can change, with a change log. */
export function AdminSettingsPage() {
  const settings = useApi<FeeSettings>('/api/admin/settings/fees')
  const format = useFormat()
  if (settings.error) return <ErrorState error={settings.error} onRetry={settings.reload} />
  if (!settings.data) return <Loading />
  const { fees, history } = settings.data
  const byKey = new Map(fees.map((f) => [f.key, f]))

  return (
    <div className="dr-page">
      <div>
        <h1 className="dr-title">Settings</h1>
        <p className="muted" style={{ margin: 0 }}>
          MTA's business details and platform fees. A fee change applies to payments started after
          you save it; payments already started keep their amount.
        </p>
      </div>

      <BusinessSettingsCard />

      {GROUPS.map((g) => (
        <section key={g.id} className="dr-card stack">
          <div>
            <h2 className="dr-subtitle">{g.title}</h2>
            <p className="muted small" style={{ margin: 0 }}>
              {g.intro}
            </p>
          </div>
          <div className="fee-list">
            {fees
              .filter((f) => f.group === g.id)
              .map((f) => (
                <FeeRow
                  key={`${f.key}-${f.amount}`}
                  fee={f}
                  onSaved={() => void settings.reload()}
                />
              ))}
          </div>
        </section>
      ))}

      <section className="dr-card stack">
        <h2 className="dr-subtitle">Change history</h2>
        {history.length === 0 ? (
          <p className="muted">No fee has been changed yet.</p>
        ) : (
          <div className="dr-table-wrap">
            <table className="dr-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Fee</th>
                  <th>From</th>
                  <th>To</th>
                  <th>Changed by</th>
                  <th>Reason</th>
                </tr>
              </thead>
              <tbody>
                {history.map((h) => {
                  const fee = byKey.get(h.key)
                  const group = GROUPS.find((g) => g.id === fee?.group)?.title
                  return (
                    <tr key={h.id}>
                      <td className="small">{format.dateTime(h.changedAt)}</td>
                      <td>
                        {fee?.label ?? h.key}
                        {group && <div className="muted small">{group}</div>}
                      </td>
                      <td>{fee ? formatFee(fee, h.oldAmount) : h.oldAmount}</td>
                      <td className="strong">{fee ? formatFee(fee, h.newAmount) : h.newAmount}</td>
                      <td className="small">{h.changedBy ?? '—'}</td>
                      <td className="small">{h.reason ?? <span className="muted">—</span>}</td>
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  )
}

function FeeRow({ fee, onSaved }: { fee: FeeSetting; onSaved: () => void }) {
  const toast = useToast()
  const format = useFormat()
  const [value, setValue] = useState(String(fee.amount))
  const [reason, setReason] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const changed = value.trim() !== '' && Number(value) !== fee.amount
  const percent = fee.unit === 'percent'

  async function save() {
    setPending(true)
    setError(null)
    try {
      await apiPut(`/api/admin/settings/fees/${fee.key}`, {
        amount: Number(value),
        reason: reason.trim() || null,
      })
      toast({ title: `${fee.label} updated to ${formatFee(fee, Number(value))}.`, tone: 'good' })
      onSaved()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <div className="fee-row">
      <div className="fee-text">
        <p className="strong" style={{ margin: 0 }}>
          {fee.label} {!fee.charged && <span className="dash-chip">Not charged yet</span>}
        </p>
        <p className="muted small" style={{ margin: 0 }}>
          {fee.description}
        </p>
        <p className="muted small" style={{ margin: 0 }}>
          {fee.updatedBy
            ? `Last changed ${format.relative(fee.updatedAt)} by ${fee.updatedBy}`
            : 'Default value, never changed'}
        </p>
      </div>
      <div className="fee-edit">
        <label className="fee-input">
          {!percent && <span>$</span>}
          <input
            type="number"
            min={0}
            max={percent ? 100 : undefined}
            step={percent ? '0.5' : '1'}
            inputMode="decimal"
            aria-label={`${fee.label} (${percent ? 'percent' : 'AUD'})`}
            value={value}
            onChange={(e) => setValue(e.target.value)}
          />
          <span>{percent ? '%' : 'AUD'}</span>
        </label>
        {changed && (
          <>
            <input
              type="text"
              className="fee-reason"
              maxLength={500}
              placeholder="Reason (optional, shown in the history)"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
            />
            <div className="row-end" style={{ gap: '0.5rem' }}>
              <button
                type="button"
                className="button-secondary"
                disabled={pending}
                onClick={() => {
                  setValue(String(fee.amount))
                  setReason('')
                  setError(null)
                }}
              >
                Cancel
              </button>
              <button type="button" disabled={pending} onClick={save}>
                {pending ? 'Saving…' : 'Save'}
              </button>
            </div>
          </>
        )}
        <FormError error={error} />
      </div>
    </div>
  )
}
