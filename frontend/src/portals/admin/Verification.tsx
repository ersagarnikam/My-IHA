import { useState } from 'react'
import { ExternalLink, ShieldAlert, ShieldCheck } from 'lucide-react'
import { useToast } from '../../components/Toasts'
import { FormError, Modal } from '../../components/ui'
import { apiPost } from '../../lib/api'
import { formatDate } from '../doctor/shared'

export type CheckOutcome = 'verified' | 'verified_with_conditions' | 'failed'

export type Check = {
  id: string
  checkType: string
  outcome: CheckOutcome
  validUntil: string | null
  details: string | null
  checkedBy: string | null
  checkedAt: string
}

export type Verifications = {
  required: { checkType: string; label: string; passing: boolean; current: Check | null }[]
  allPassing: boolean
  history: Check[]
  registerUrl: string | null
}

const OUTCOME: Record<CheckOutcome, string> = {
  verified: 'Verified',
  verified_with_conditions: 'Verified with conditions',
  failed: 'Not verified',
}

const HINT: Record<string, string> = {
  ahpra:
    'Search the AHPRA public register by name or registration number. Check the registration type, specialty, expiry and any conditions, undertakings or reprimands.',
  accreditation:
    'Check the NSQHS accreditation certificate (from the accrediting agency, e.g. ACHS) and its expiry date.',
  licence:
    "Check the private hospital licence on the state or territory health department's register and its expiry date.",
}

/**
 * Register checks MTA records before approving a provider (AHPRA for doctors,
 * accreditation and licence for hospitals). The latest check of each kind counts.
 */
export function VerificationCard({
  providerType,
  providerId,
  data,
  onChange,
}: {
  providerType: 'doctor' | 'hospital'
  providerId: string
  data: Verifications
  onChange: () => void
}) {
  const [checkType, setCheckType] = useState<string | null>(null)
  const label = data.required.find((r) => r.checkType === checkType)?.label ?? ''
  return (
    <section className="dr-card stack">
      <div className="row-between">
        <h2 className="dr-subtitle">Register checks</h2>
        {data.registerUrl && (
          <a href={data.registerUrl} target="_blank" rel="noreferrer" className="small">
            AHPRA public register <ExternalLink size={12} />
          </a>
        )}
      </div>
      <ul className="admin-checks">
        {data.required.map((r) => (
          <li key={r.checkType} className="admin-check">
            <span className={`admin-check-icon${r.passing ? ' good' : ' bad'}`}>
              {r.passing ? <ShieldCheck size={18} /> : <ShieldAlert size={18} />}
            </span>
            <div className="admin-check-body">
              <p className="dr-file-name">{r.label}</p>
              <p className="muted small" style={{ margin: 0 }}>
                {r.current ? (
                  <>
                    {OUTCOME[r.current.outcome]}
                    {r.current.validUntil && ` · valid until ${formatDate(r.current.validUntil)}`}
                    {r.current.validUntil &&
                      !r.passing &&
                      r.current.outcome !== 'failed' &&
                      ' (expired)'}
                    {' · checked '}
                    {formatDate(r.current.checkedAt)}
                    {r.current.checkedBy && ` by ${r.current.checkedBy}`}
                  </>
                ) : (
                  'Not checked yet'
                )}
              </p>
              {r.current?.details && <p className="small prewrap">{r.current.details}</p>}
            </div>
            <button
              type="button"
              className="button-secondary"
              onClick={() => setCheckType(r.checkType)}
            >
              Record check
            </button>
          </li>
        ))}
      </ul>
      {!data.allPassing && (
        <p className="muted small" style={{ margin: 0 }}>
          Approval needs a passing, unexpired check of each kind.
        </p>
      )}
      {data.history.length > data.required.filter((r) => r.current).length && (
        <details className="small">
          <summary>History ({data.history.length})</summary>
          <ul className="admin-check-history">
            {data.history.map((c) => (
              <li key={c.id}>
                {formatDate(c.checkedAt)} ·{' '}
                {data.required.find((r) => r.checkType === c.checkType)?.label ?? c.checkType} ·{' '}
                {OUTCOME[c.outcome]}
                {c.validUntil && ` until ${formatDate(c.validUntil)}`}
                {c.checkedBy && ` · ${c.checkedBy}`}
                {c.details && ` — ${c.details}`}
              </li>
            ))}
          </ul>
        </details>
      )}
      <CheckDialog
        open={checkType !== null}
        checkType={checkType ?? ''}
        label={label}
        path={`/api/admin/verifications/${providerType}/${providerId}`}
        onClose={() => setCheckType(null)}
        onDone={() => {
          setCheckType(null)
          onChange()
        }}
      />
    </section>
  )
}

function CheckDialog({
  open,
  checkType,
  label,
  path,
  onClose,
  onDone,
}: {
  open: boolean
  checkType: string
  label: string
  path: string
  onClose: () => void
  onDone: () => void
}) {
  const toast = useToast()
  const [outcome, setOutcome] = useState<CheckOutcome>('verified')
  const [validUntil, setValidUntil] = useState('')
  const [details, setDetails] = useState('')
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)
  const needsDate = outcome !== 'failed'
  const needsDetails = outcome !== 'verified'

  async function save() {
    setPending(true)
    setError(null)
    try {
      await apiPost(path, {
        checkType,
        outcome,
        validUntil: needsDate && validUntil ? validUntil : null,
        details: details.trim() || null,
      })
      toast({ title: `${label} check recorded.`, tone: 'good' })
      setOutcome('verified')
      setValidUntil('')
      setDetails('')
      onDone()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={() => !pending && onClose()} title={`Record ${label} check`}>
      <div className="stack">
        <p className="muted">{HINT[checkType]}</p>
        <label className="field">
          <span className="field-label">What did you find?</span>
          <select value={outcome} onChange={(e) => setOutcome(e.target.value as CheckOutcome)}>
            {Object.entries(OUTCOME).map(([key, text]) => (
              <option key={key} value={key}>
                {text}
              </option>
            ))}
          </select>
        </label>
        {needsDate && (
          <label className="field">
            <span className="field-label">Valid until</span>
            <input type="date" value={validUntil} onChange={(e) => setValidUntil(e.target.value)} />
          </label>
        )}
        <label className="field">
          <span className="field-label">
            {outcome === 'verified_with_conditions'
              ? 'Conditions, undertakings or restrictions'
              : outcome === 'failed'
                ? 'What was wrong'
                : 'Notes (optional)'}
          </span>
          <textarea
            rows={3}
            maxLength={1000}
            value={details}
            onChange={(e) => setDetails(e.target.value)}
            placeholder="e.g. registration number, registration type, specialty"
          />
        </label>
        <FormError error={error} />
        <div className="row-end">
          <button type="button" className="button-secondary" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className={outcome === 'failed' ? 'button-danger' : undefined}
            disabled={
              pending ||
              (needsDate && !validUntil) ||
              (needsDetails && outcome !== 'failed' && !details.trim())
            }
            onClick={save}
          >
            {pending ? 'Saving…' : 'Save check'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
