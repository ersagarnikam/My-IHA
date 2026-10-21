import { useState } from 'react'
import { Link, useOutletContext, useParams } from 'react-router'
import { useToast } from '../../components/Toasts'
import { ErrorState, FormError, Loading, Modal } from '../../components/ui'
import { apiPost } from '../../lib/api'
import { useFormat } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import { BackHeader, formatDate, PillTabs, SearchBox, usePaged } from '../doctor/shared'
import type { AdminOutletContext } from './AdminLayout'
import { Fact } from './DoctorPages'
import {
  PAYMENT_TYPE,
  paymentStatus,
  type AdminPayment,
  type AdminPaymentDetail,
  type RefundQuote,
} from './types'

const audFormat = new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' })
export const aud = (amount: number) => audFormat.format(amount)

type Tab = 'all' | 'patient' | 'doctor' | 'refunds'

const TABS: { id: Tab; label: string }[] = [
  { id: 'all', label: 'All' },
  { id: 'patient', label: 'Patients' },
  { id: 'doctor', label: 'Doctors' },
  { id: 'refunds', label: 'With refunds' },
]

export function PaymentStatus({
  payment,
}: {
  payment: Pick<AdminPayment, 'status' | 'refundedAud'>
}) {
  const [label, tone] = paymentStatus(payment)
  return <span className={`badge badge-sm ${tone}`}>{label}</span>
}

/** Every payment received, patients' and doctors'. */
export function AdminPaymentsPage() {
  const list = useApi<AdminPayment[]>('/api/admin/payments')
  const [tab, setTab] = useState<Tab>('all')
  const [query, setQuery] = useState('')
  const q = query.trim().toLowerCase()
  const rows = (list.data ?? []).filter(
    (p) =>
      (tab === 'all' || (tab === 'refunds' ? p.refundCount > 0 : p.kind === tab)) &&
      (!q ||
        (p.payerName ?? '').toLowerCase().includes(q) ||
        (p.caseReference ?? '').toLowerCase().includes(q) ||
        (p.gatewayReference ?? '').toLowerCase().includes(q)),
  )
  const paged = usePaged(rows)
  if (list.error) return <ErrorState error={list.error} onRetry={list.reload} />
  if (!list.data) return <Loading />
  const received = list.data.reduce((sum, p) => sum + p.amountAud, 0)
  const refunded = list.data.reduce((sum, p) => sum + p.refundedToCardAud, 0)

  return (
    <div className="dr-page">
      <div className="row-between">
        <h1 className="dr-title">Payments</h1>
        <p className="muted small" style={{ margin: 0 }}>
          {aud(received)} received · {aud(refunded)} refunded to cards
        </p>
      </div>
      <PillTabs
        tabs={TABS}
        active={tab}
        onChange={(t) => {
          setTab(t)
          paged.reset()
        }}
      />
      <section className="dr-card">
        <div className="dr-toolbar">
          <SearchBox
            value={query}
            onChange={setQuery}
            placeholder="Search by payer, case ID or payment reference"
          />
        </div>
        <PaymentsTable rows={paged.rows} empty="No payments here." />
        {paged.footer}
      </section>
    </div>
  )
}

export function PaymentsTable({
  rows,
  empty,
  compact,
}: {
  rows: AdminPayment[]
  empty: string
  compact?: boolean
}) {
  return (
    <div className="dr-table-wrap">
      <table className="dr-table">
        <thead>
          <tr>
            <th>Paid</th>
            {!compact && <th>Payer</th>}
            <th>Type</th>
            {!compact && <th>Case ID</th>}
            <th>Amount</th>
            <th>Refunded</th>
            <th>Status</th>
            <th>Action</th>
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 && (
            <tr>
              <td colSpan={compact ? 6 : 8} className="dr-empty-row">
                {empty}
              </td>
            </tr>
          )}
          {rows.map((p) => (
            <tr key={`${p.kind}-${p.id}`}>
              <td>{formatDate(p.paidAt)}</td>
              {!compact && (
                <td>
                  <span className="strong">{p.payerName ?? '—'}</span>
                  <br />
                  <span className="muted small">{p.kind === 'patient' ? 'Patient' : 'Doctor'}</span>
                </td>
              )}
              <td>{PAYMENT_TYPE[p.type]}</td>
              {!compact && (
                <td>
                  {p.caseId ? <Link to={`/admin/cases/${p.caseId}`}>{p.caseReference}</Link> : '—'}
                </td>
              )}
              <td>{aud(p.amountAud)}</td>
              <td>
                {p.refundedToCardAud > 0 ? (
                  aud(p.refundedToCardAud)
                ) : (
                  <span className="muted">—</span>
                )}
              </td>
              <td>
                <PaymentStatus payment={p} />
              </td>
              <td>
                <Link className="button dr-view" to={`/admin/payments/${p.kind}/${p.id}`}>
                  {p.status === 'completed' ? 'Refund / View' : 'View'}
                </Link>
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

export function AdminPaymentDetailPage() {
  const { kind, paymentId } = useParams()
  const format = useFormat()
  const detail = useApi<AdminPaymentDetail>(`/api/admin/payments/${kind}/${paymentId}`)
  const [refundOpen, setRefundOpen] = useState(false)
  if (detail.error) return <ErrorState error={detail.error} onRetry={detail.reload} />
  if (!detail.data) return <Loading />
  const { payment: p, quote, refunds, reasons } = detail.data
  const canRefund = quote.refundableAud > 0 && p.status === 'completed'

  return (
    <div className="dr-page">
      <BackHeader
        to="/admin/payments"
        title={`${PAYMENT_TYPE[p.type]} · ${aud(p.amountAud)}`}
        subtitle={`${p.payerName ?? 'Unknown payer'} · paid ${format.dateTime(p.paidAt)}`}
      />

      <section className="dr-card row-between">
        <span>
          <PaymentStatus payment={p} />{' '}
          {p.caseId && (
            <Link className="small" to={`/admin/cases/${p.caseId}`}>
              Case {p.caseReference}
            </Link>
          )}
          {p.kind === 'doctor' && (
            <Link className="small" to={`/admin/doctors/${p.payerId}`}>
              Open doctor
            </Link>
          )}
        </span>
        {canRefund ? (
          <button type="button" onClick={() => setRefundOpen(true)}>
            Refund
          </button>
        ) : (
          <span className="muted small">
            {p.status === 'refunded' ? 'Fully refunded' : 'Nothing left to refund'}
          </span>
        )}
      </section>

      <section className="dr-card stack">
        <h2 className="dr-subtitle">Summary</h2>
        <div className="dr-kv">
          <Fact label="Paid" value={aud(p.amountAud)} />
          <Fact label="Refunded (before card fees)" value={aud(quote.refundedAud)} />
          <Fact label="Refunded to the card" value={aud(quote.refundedToCardAud)} />
          <Fact label="Still refundable" value={aud(quote.refundableAud)} />
          <Fact
            label={
              quote.feeSource === 'stripe'
                ? 'Card processing fee (from Stripe)'
                : 'Card processing fee (estimate)'
            }
            value={`${aud(quote.feeAud)} · ${aud(quote.feeDeductedAud)} deducted so far`}
          />
          <Fact label="Payment reference" value={p.gatewayReference} />
        </div>
      </section>

      <section className="dr-card stack">
        <h2 className="dr-subtitle">Refunds</h2>
        {refunds.length === 0 ? (
          <p className="muted">No refunds yet.</p>
        ) : (
          <div className="dr-table-wrap">
            <table className="dr-table">
              <thead>
                <tr>
                  <th>When</th>
                  <th>Amount</th>
                  <th>Card fee kept</th>
                  <th>To the card</th>
                  <th>Reason</th>
                  <th>By</th>
                  <th>Status</th>
                </tr>
              </thead>
              <tbody>
                {refunds.map((r) => (
                  <tr key={r.id}>
                    <td className="small">{format.dateTime(r.createdAt)}</td>
                    <td>{aud(r.amountAud)}</td>
                    <td>
                      {r.feeSource === 'waived' ? (
                        <span className="muted">Waived</span>
                      ) : (
                        aud(r.feeDeductedAud)
                      )}
                    </td>
                    <td className="strong">{aud(r.refundedAud)}</td>
                    <td>
                      {reasons[r.reason] ?? r.reason}
                      {r.note && <div className="muted small prewrap">{r.note}</div>}
                    </td>
                    <td className="small">{r.createdBy ?? '—'}</td>
                    <td>
                      <span
                        className={`badge badge-sm ${r.status === 'succeeded' ? 'badge-good' : r.status === 'failed' ? 'badge-bad' : 'badge-warn'}`}
                      >
                        {r.status === 'succeeded'
                          ? 'Refunded'
                          : r.status === 'failed'
                            ? 'Failed'
                            : 'Processing'}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <RefundDialog
        open={refundOpen}
        kind={p.kind}
        paymentId={p.id}
        payer={p.payerName}
        quote={quote}
        reasons={reasons}
        onClose={() => setRefundOpen(false)}
        onDone={(next) => {
          detail.setData(next)
          setRefundOpen(false)
        }}
      />
    </div>
  )
}

/** Full or partial refund; shows the card fee that will be kept and what goes back to the card. */
function RefundDialog({
  open,
  kind,
  paymentId,
  payer,
  quote,
  reasons,
  onClose,
  onDone,
}: {
  open: boolean
  kind: string
  paymentId: string
  payer: string | null
  quote: RefundQuote
  reasons: Record<string, string>
  onClose: () => void
  onDone: (detail: AdminPaymentDetail) => void
}) {
  const toast = useToast()
  const { refreshCounts } = useOutletContext<AdminOutletContext>()
  const [mode, setMode] = useState<'full' | 'partial'>('full')
  const [amount, setAmount] = useState('')
  const [reason, setReason] = useState('')
  const [note, setNote] = useState('')
  const [waive, setWaive] = useState(false)
  const [error, setError] = useState<unknown>(null)
  const [pending, setPending] = useState(false)

  const value = mode === 'full' ? quote.refundableAud : Number(amount)
  const valid = Number.isFinite(value) && value > 0 && value <= quote.refundableAud
  const fee = waive || !valid ? 0 : Math.min(quote.feeRemainingAud, value)
  const toCard = valid ? Math.round((value - fee) * 100) / 100 : 0
  const noteNeeded = reason === 'other' && note.trim().length < 5
  const ready = valid && toCard > 0 && reason !== '' && !noteNeeded

  async function submit() {
    setPending(true)
    setError(null)
    try {
      const next = await apiPost<AdminPaymentDetail>(
        `/api/admin/payments/${kind}/${paymentId}/refunds`,
        {
          amountAud: value,
          reason,
          note: note.trim() || null,
          waiveFee: waive,
        },
      )
      const latest = next.refunds.at(-1)
      if (latest?.status === 'failed') {
        toast({
          title: 'The payment provider declined the refund. Nothing was refunded.',
          tone: 'bad',
        })
      } else {
        toast({
          title: `Refund of ${aud(toCard)} issued${payer ? ` to ${payer}` : ''}.`,
          tone: 'good',
        })
      }
      setAmount('')
      setReason('')
      setNote('')
      setWaive(false)
      setMode('full')
      onDone(next)
      refreshCounts()
    } catch (err) {
      setError(err)
    } finally {
      setPending(false)
    }
  }

  return (
    <Modal open={open} onClose={() => !pending && onClose()} title="Refund payment">
      <div className="stack">
        <div className="dr-pills">
          <button
            type="button"
            className={mode === 'full' ? 'dr-pill active' : 'dr-pill'}
            onClick={() => setMode('full')}
          >
            Full ({aud(quote.refundableAud)})
          </button>
          <button
            type="button"
            className={mode === 'partial' ? 'dr-pill active' : 'dr-pill'}
            onClick={() => setMode('partial')}
          >
            Partial
          </button>
        </div>
        {mode === 'partial' && (
          <label className="field">
            <span className="field-label">Amount to refund (AUD)</span>
            <input
              type="number"
              min={0.01}
              max={quote.refundableAud}
              step="0.01"
              inputMode="decimal"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              autoFocus
            />
            <span className="field-hint">Up to {aud(quote.refundableAud)}.</span>
          </label>
        )}
        <label className="field">
          <span className="field-label">Reason</span>
          <select value={reason} onChange={(e) => setReason(e.target.value)}>
            <option value="">Choose a reason…</option>
            {Object.entries(reasons).map(([key, label]) => (
              <option key={key} value={key}>
                {label}
              </option>
            ))}
          </select>
        </label>
        <label className="field">
          <span className="field-label">
            Note {reason === 'other' ? '(required)' : '(optional, internal)'}
          </span>
          <textarea
            rows={2}
            maxLength={1000}
            value={note}
            onChange={(e) => setNote(e.target.value)}
          />
        </label>
        <label className="row" style={{ gap: '0.5rem', alignItems: 'flex-start' }}>
          <input type="checkbox" checked={waive} onChange={(e) => setWaive(e.target.checked)} />
          <span>
            Waive the card processing fee
            <span className="muted small" style={{ display: 'block' }}>
              Only when the charge was MTA's mistake (e.g. a duplicate payment). MTA then absorbs
              the fee.
            </span>
          </span>
        </label>
        <div className="refund-breakdown">
          <div>
            <span>Refund</span>
            <span>{valid ? aud(value) : '—'}</span>
          </div>
          <div>
            <span>
              Less card processing fee
              {quote.feeSource === 'estimate' ? ' (estimate)' : ''}
            </span>
            <span>{waive ? 'Waived' : valid ? `− ${aud(fee)}` : '—'}</span>
          </div>
          <div className="total">
            <span>Back to the card</span>
            <span>{valid ? aud(toCard) : '—'}</span>
          </div>
        </div>
        {valid && toCard <= 0 && (
          <p className="field-error">
            The card processing fee is larger than this amount; refund more or waive the fee.
          </p>
        )}
        <FormError error={error} />
        <div className="row-end">
          <button type="button" className="button-secondary" onClick={onClose} disabled={pending}>
            Cancel
          </button>
          <button
            type="button"
            className="button-danger"
            disabled={!ready || pending}
            onClick={submit}
          >
            {pending ? 'Refunding…' : valid ? `Refund ${aud(toCard)}` : 'Refund'}
          </button>
        </div>
      </div>
    </Modal>
  )
}
