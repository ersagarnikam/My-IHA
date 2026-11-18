import { useState } from 'react'
import { useNavigate } from 'react-router'
import { Download } from 'lucide-react'
import { apiGet, openFile } from '../lib/api'
import { useApi } from '../lib/useApi'
import { GateShell } from '../portals/doctor/registration/RegistrationPages'
import { formatDate, money } from '../portals/doctor/shared'
import { Checkout } from '../portals/patient/payments/Checkout'
import { useToast } from './Toasts'
import { Empty, ErrorState, Loading } from './ui'
import '../portals/doctor/doctor.css'

// Hospital and visa lawyer membership fees (backend providerfee/, /api/{hospital,lawyer}/billing).
// English only, like the hospital and lawyer portals.

export type ProviderPortal = 'hospital' | 'lawyer'

/** Fee status, on the account response and the billing response. */
export type Membership = {
  registrationFeeAud: number
  annualFeeAud: number
  /** Approved but the registration fee is unpaid: the portal is locked. */
  registrationFeeDue: boolean
  registrationFeePaidAt: string | null
  /** The fee was 0 when MTA approved the account, so nothing was charged. */
  registrationFeeWaived: boolean
  annualFeeNextDueAt: string | null
  /** The renewal date has passed: a reminder, never a lock. */
  annualFeeDue: boolean
}

type FeePayment = {
  id: string
  feeType: 'registration' | 'annual'
  amountAud: number
  billingPeriod: string | null
  status: 'pending' | 'completed' | 'failed' | 'refunded'
  paidAt: string | null
  createdAt: string
  refundedAud: number
}

type Billing = { membership: Membership; payments: FeePayment[] }

const api = (portal: ProviderPortal) => `/api/${portal}/billing`

/** The gate page after approval: pay the one-time registration fee to open the portal. */
export function ProviderRegistrationFeePage({
  portal,
  membership,
  reload,
}: {
  portal: ProviderPortal
  membership: Membership
  reload: () => Promise<void>
}) {
  const navigate = useNavigate()
  return (
    <GateShell
      title="Registration fee"
      subtitle="MTA has approved your registration. Pay the one-time registration fee to open your portal."
    >
      <section className="dr-card stack">
        <div className="row-between">
          <span>One-time registration fee</span>
          <strong>{money(membership.registrationFeeAud)}</strong>
        </div>
        {membership.annualFeeAud > 0 && (
          <p className="muted small" style={{ margin: 0 }}>
            An annual membership fee of {money(membership.annualFeeAud)} falls due one year after
            payment.
          </p>
        )}
        <Checkout
          checkoutPath={`${api(portal)}/checkout`}
          body={{ feeType: 'registration' }}
          simulatePath={(intentId) => `${api(portal)}/simulate/${intentId}`}
          onPaid={async () => {
            // With Stripe the webhook can land a moment after the card confirms.
            for (let i = 0; i < 10 && !(await registrationSettled(portal)); i++) {
              await new Promise((r) => setTimeout(r, 1000))
            }
            await reload()
            navigate(`/${portal}/dashboard`, { replace: true })
          }}
        />
      </section>
    </GateShell>
  )
}

async function registrationSettled(portal: ProviderPortal) {
  try {
    const billing = await apiGet<Billing>(api(portal))
    return !billing.membership.registrationFeeDue
  } catch {
    return false
  }
}

/** Shown on the dashboard while the annual renewal is overdue. */
export function RenewalDueBanner({
  portal,
  membership,
}: {
  portal: ProviderPortal
  membership: Membership | null | undefined
}) {
  const navigate = useNavigate()
  if (!membership?.annualFeeDue) return null
  return (
    <div className="panel row-between" role="status">
      <div>
        <strong>Your annual membership fee is due</strong>
        <p className="muted small" style={{ margin: 0 }}>
          {money(membership.annualFeeAud)}
          {membership.annualFeeNextDueAt
            ? `, due ${formatDate(membership.annualFeeNextDueAt)}`
            : ''}
          .
        </p>
      </div>
      <button type="button" onClick={() => navigate(`/${portal}/account-settings?tab=billing`)}>
        Pay now
      </button>
    </div>
  )
}

/** Account settings → Billing: membership status, the annual renewal and invoices. */
export function ProviderBillingTab({
  portal,
  onChanged,
}: {
  portal: ProviderPortal
  onChanged: () => void
}) {
  const toast = useToast()
  const billing = useApi<Billing>(api(portal))
  const [paying, setPaying] = useState(false)
  if (billing.error) return <ErrorState error={billing.error} onRetry={billing.reload} />
  if (!billing.data) return <Loading />
  const m = billing.data.membership
  const paid = billing.data.payments.filter((p) => p.paidAt !== null)
  return (
    <>
      <section className="dr-card stack">
        <div>
          <h2 className="dr-subtitle">Billing</h2>
          <p className="muted small" style={{ margin: 0 }}>
            Your MTA membership.
          </p>
        </div>
        <div className="panel row-between">
          <div>
            <strong>Registration fee</strong>
            <p className="muted small" style={{ margin: 0 }}>
              {m.registrationFeeWaived
                ? 'No registration fee applied when you joined.'
                : m.registrationFeePaidAt
                  ? `Paid ${formatDate(m.registrationFeePaidAt)}`
                  : 'Not paid yet.'}
            </p>
          </div>
        </div>
        <div className="panel row-between">
          <div>
            <strong>
              Annual membership fee —{' '}
              {m.annualFeeAud > 0 ? money(m.annualFeeAud) : 'no fee at the moment'}
            </strong>
            <p className="muted small" style={{ margin: 0 }}>
              {m.annualFeeNextDueAt
                ? `${m.annualFeeDue ? 'Was due' : 'Next due'} ${formatDate(m.annualFeeNextDueAt)}`
                : 'No renewal date set yet.'}
            </p>
          </div>
          {m.annualFeeDue && !paying && (
            <button type="button" onClick={() => setPaying(true)}>
              Pay now
            </button>
          )}
        </div>
        {paying && (
          <Checkout
            checkoutPath={`${api(portal)}/checkout`}
            body={{ feeType: 'annual' }}
            simulatePath={(intentId) => `${api(portal)}/simulate/${intentId}`}
            onPaid={() => {
              setPaying(false)
              void billing.reload()
              onChanged()
            }}
          />
        )}
      </section>
      <section className="dr-card">
        <h2 className="dr-subtitle" style={{ marginBottom: '1rem' }}>
          Invoices
        </h2>
        {paid.length === 0 ? (
          <Empty title="No invoices yet">
            <p className="muted">Your payment history will appear here once you've been charged.</p>
          </Empty>
        ) : (
          <div className="dr-table-wrap">
            <table className="dr-table">
              <thead>
                <tr>
                  <th>Date</th>
                  <th>Type</th>
                  <th>Amount</th>
                  <th>Status</th>
                  <th>Action</th>
                </tr>
              </thead>
              <tbody>
                {paid.map((p) => (
                  <tr key={p.id}>
                    <td>{formatDate(p.paidAt)}</td>
                    <td>
                      {p.feeType === 'registration' ? 'Registration Fee' : 'Annual Membership Fee'}
                    </td>
                    <td>
                      {money(p.amountAud)}
                      {p.refundedAud > 0 && (
                        <div className="muted small">{money(p.refundedAud)} refunded</div>
                      )}
                    </td>
                    <td>
                      {p.status === 'refunded' ? (
                        <span className="badge badge-sm badge-muted">Refunded</span>
                      ) : p.refundedAud > 0 ? (
                        <span className="badge badge-sm badge-warn">Partly refunded</span>
                      ) : (
                        <span className="badge badge-sm badge-good">Paid</span>
                      )}
                    </td>
                    <td>
                      <button
                        type="button"
                        className="dr-icon-button"
                        aria-label="Download invoice"
                        onClick={() =>
                          openFile(
                            `${api(portal)}/payments/${p.id}/invoice`,
                            `MTA-invoice-${p.id.slice(0, 8)}.pdf`,
                          ).catch(() =>
                            toast({ title: 'Could not download the invoice.', tone: 'bad' }),
                          )
                        }
                      >
                        <Download size={16} />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </>
  )
}

/** One line for MTA admin on a hospital's or lawyer's page. */
export function MembershipSummary({ membership: m }: { membership: Membership }) {
  const registration = m.registrationFeeDue
    ? `Registration fee of ${money(m.registrationFeeAud)} not paid yet — their portal is locked`
    : m.registrationFeeWaived
      ? 'No registration fee applied when they joined'
      : m.registrationFeePaidAt
        ? `Registration fee paid ${formatDate(m.registrationFeePaidAt)}`
        : 'No registration fee applies'
  const annual = m.annualFeeNextDueAt
    ? `annual fee ${m.annualFeeDue ? 'overdue since' : 'next due'} ${formatDate(m.annualFeeNextDueAt)}`
    : null
  return (
    <div className={`dr-banner${m.registrationFeeDue || m.annualFeeDue ? '' : ' info'}`}>
      <strong>Membership:</strong> {registration}
      {annual ? ` · ${annual}` : ''}.
    </div>
  )
}
