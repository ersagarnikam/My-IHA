import { useMemo, useState } from 'react'
import { Link } from 'react-router'
import { Badge, Empty, ErrorState, FormError, Loading } from '../../../components/ui'
import { useT } from '../../../i18n/I18nContext'
import { openFile } from '../../../lib/api'
import { useFormat } from '../../../lib/format'
import type { PaymentRow } from '../../../lib/types'
import { useApi } from '../../../lib/useApi'

const PAGE_SIZE = 10
const TONE = { completed: 'good', pending: 'warn', failed: 'bad', refunded: 'muted' } as const

export function PaymentsPage() {
  const t = useT('payments')
  const format = useFormat()
  const payments = useApi<PaymentRow[]>('/api/patient/payments')
  const [query, setQuery] = useState('')
  const [page, setPage] = useState(0)
  const [error, setError] = useState<unknown>(null)

  const filtered = useMemo(
    () =>
      (payments.data ?? []).filter((p) =>
        (p.caseReference ?? '').toLowerCase().includes(query.trim().toLowerCase()),
      ),
    [payments.data, query],
  )

  if (payments.error) return <ErrorState error={payments.error} onRetry={payments.reload} />
  if (!payments.data) return <Loading />

  const pages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const rows = filtered.slice(page * PAGE_SIZE, page * PAGE_SIZE + PAGE_SIZE)

  function payLink(p: PaymentRow) {
    return p.paymentType === 'consultation_fee' && p.consultationRequestId
      ? `/patient/cases/${p.caseId}/consultations/${p.consultationRequestId}/payment`
      : `/patient/cases/${p.caseId}/payment`
  }

  async function invoice(p: PaymentRow, download: boolean) {
    setError(null)
    try {
      await openFile(
        `/api/patient/payments/${p.id}/invoice${download ? '?download=true' : ''}`,
        download ? `invoice-${p.caseReference}.pdf` : undefined,
      )
    } catch (err) {
      setError(err)
    }
  }

  return (
    <section className="stack">
      <div>
        <h1>{t('title')}</h1>
        <p className="muted">{t('subtitle')}</p>
      </div>
      {payments.data.length === 0 ? (
        <Empty title={t('noPayments')}>
          <p className="muted">{t('noPaymentsSubtext')}</p>
        </Empty>
      ) : (
        <div className="card stack">
          <input
            type="search"
            placeholder={t('search')}
            value={query}
            onChange={(e) => {
              setQuery(e.target.value)
              setPage(0)
            }}
            className="search"
          />
          <FormError error={error} />
          <div className="table-scroll">
            <table className="table">
              <thead>
                <tr>
                  <th>{t('date')}</th>
                  <th>{t('caseId')}</th>
                  <th>{t('paymentType')}</th>
                  <th className="num">{t('amount')}</th>
                  <th>{t('status')}</th>
                  <th>{t('action')}</th>
                </tr>
              </thead>
              <tbody>
                {rows.map((p) => (
                  <tr key={p.id}>
                    <td>{format.date(p.paidAt ?? p.createdAt)}</td>
                    <td>
                      <Link to={`/patient/cases/${p.caseId}`}>{p.caseReference}</Link>
                    </td>
                    <td>{t(`paymentTypeLabels.${p.paymentType}`)}</td>
                    <td className="num">{format.money(p.amountAud)}</td>
                    <td>
                      <Badge tone={TONE[p.status]}>{t(`statusLabels.${p.status}`)}</Badge>
                    </td>
                    <td className="actions">
                      {p.status === 'completed' && (
                        <>
                          <button
                            type="button"
                            className="button-link"
                            onClick={() => invoice(p, false)}
                          >
                            {t('viewInvoice')}
                          </button>
                          <button
                            type="button"
                            className="button-link"
                            onClick={() => invoice(p, true)}
                          >
                            {t('download')}
                          </button>
                        </>
                      )}
                      {p.status === 'pending' && <Link to={payLink(p)}>{t('payNow')}</Link>}
                      {p.status === 'failed' && <Link to={payLink(p)}>{t('retry')}</Link>}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {filtered.length === 0 && <p className="muted">{t('noResults', { query })}</p>}
          {pages > 1 && (
            <div className="row-end">
              <button
                type="button"
                className="button-secondary"
                disabled={page === 0}
                onClick={() => setPage(page - 1)}
              >
                ‹
              </button>
              <span className="muted small">
                {page + 1} / {pages}
              </span>
              <button
                type="button"
                className="button-secondary"
                disabled={page >= pages - 1}
                onClick={() => setPage(page + 1)}
              >
                ›
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
