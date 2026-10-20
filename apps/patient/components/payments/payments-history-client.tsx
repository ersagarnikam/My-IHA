'use client'

import { useState } from 'react'
import Link from 'next/link'
import { Search, CreditCard, Loader2, Eye, Download } from 'lucide-react'
import { useTranslations } from 'next-intl'
import type { PaymentWithCaseInfo } from '@iha/db/payments'

function formatAUD(amount: number) {
  return new Intl.NumberFormat('en-AU', {
    style: 'currency',
    currency: 'AUD',
    maximumFractionDigits: 0,
  }).format(amount)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', {
    day: 'numeric',
    month: 'short',
    year: 'numeric',
  })
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700',
  pending:   'bg-amber-50 text-amber-700',
  failed:    'bg-red-50 text-red-700',
  refunded:  'bg-slate-100 text-slate-600',
}

const STATUS_LABEL_KEYS = ['completed', 'pending', 'failed', 'refunded'] as const
const PAYMENT_TYPE_LABEL_KEYS = ['consultation_fee', 'full_payment'] as const

const PAGE_SIZE = 10

type Props = {
  payments: PaymentWithCaseInfo[]
}

export function PaymentsHistoryClient({ payments }: Props) {
  const t = useTranslations('payments')
  const [search, setSearch] = useState('')
  const [page, setPage] = useState(1)
  const [loadingReceiptId, setLoadingReceiptId] = useState<string | null>(null)

  async function handleViewInvoice(intentId: string) {
    setLoadingReceiptId(intentId)
    try {
      const res = await fetch(`/api/payments/invoice?intentId=${encodeURIComponent(intentId)}`)
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
    } finally {
      setLoadingReceiptId(null)
    }
  }

  // The route responds with Content-Disposition: attachment (and the
  // correct filename) for ?download=1, so the browser handles the save —
  // no need to fetch a blob and drive a synthetic <a> click ourselves.
  function handleDownloadInvoice(intentId: string) {
    window.location.assign(`/api/payments/invoice?intentId=${encodeURIComponent(intentId)}&download=1`)
  }

  const filtered = payments.filter((p) => {
    const ref = (p.cases?.reference_number ?? '').toLowerCase()
    const q = search.toLowerCase()
    return ref.includes(q)
  })

  const totalPages = Math.max(1, Math.ceil(filtered.length / PAGE_SIZE))
  const paginated = filtered.slice((page - 1) * PAGE_SIZE, page * PAGE_SIZE)

  function handleSearch(q: string) {
    setSearch(q)
    setPage(1)
  }

  if (payments.length === 0) {
    return (
      <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white py-16 text-center">
        <div className="grid h-12 w-12 place-items-center rounded-full bg-slate-100">
          <CreditCard className="h-6 w-6 text-slate-400" />
        </div>
        <p className="text-sm font-medium text-slate-700">{t('noPayments')}</p>
        <p className="text-xs text-slate-400">{t('noPaymentsSubtext')}</p>
      </div>
    )
  }

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      {/* Search */}
      <div className="flex items-center justify-end border-b border-slate-100 px-4 py-3">
        <div className="relative w-56">
          <Search className="absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder={t('search')}
            value={search}
            onChange={(e) => handleSearch(e.target.value)}
            className="h-8 w-full rounded-md border border-slate-200 bg-slate-50 pl-8 pr-3 text-xs text-slate-700 placeholder:text-slate-400 focus:border-cyan-400 focus:outline-none"
          />
        </div>
      </div>

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
              <th className="px-4 py-3 font-medium">{t('date')}</th>
              <th className="px-4 py-3 font-medium">{t('caseId')}</th>
              <th className="px-4 py-3 font-medium">{t('paymentType')}</th>
              <th className="px-4 py-3 font-medium">{t('amount')}</th>
              <th className="px-4 py-3 font-medium">{t('status')}</th>
              <th className="px-4 py-3 text-right font-medium">{t('action')}</th>
            </tr>
          </thead>
          <tbody>
            {paginated.length === 0 ? (
              <tr>
                <td colSpan={6} className="py-10 text-center text-sm text-slate-400">
                  {t('noResults', { query: search })}
                </td>
              </tr>
            ) : (
              paginated.map((payment) => {
                const dateStr = payment.paid_at
                  ? formatDate(payment.paid_at)
                  : formatDate(payment.created_at)

                return (
                  <tr
                    key={payment.id}
                    className="border-b border-slate-50 last:border-0 hover:bg-slate-50"
                  >
                    <td className="px-4 py-3.5 text-slate-500">{dateStr}</td>
                    <td className="px-4 py-3.5 font-medium">
                      <Link
                        href={`/cases/${payment.case_id}`}
                        className="text-cyan-700 hover:underline"
                      >
                        {payment.cases?.reference_number ?? '—'}
                      </Link>
                    </td>
                    <td className="px-4 py-3.5 text-slate-600">
                      {(PAYMENT_TYPE_LABEL_KEYS as readonly string[]).includes(
                        payment.payment_type,
                      )
                        ? t(`paymentTypeLabels.${payment.payment_type}` as never)
                        : payment.payment_type}
                    </td>
                    <td className="px-4 py-3.5 font-medium text-slate-900">
                      {formatAUD(payment.amount_aud)}
                    </td>
                    <td className="px-4 py-3.5">
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[payment.status] ?? 'bg-slate-100 text-slate-600'}`}
                      >
                        {(STATUS_LABEL_KEYS as readonly string[]).includes(payment.status)
                          ? t(`statusLabels.${payment.status}` as never)
                          : payment.status}
                      </span>
                    </td>
                    <td className="px-4 py-3.5 text-right">
                      {payment.status === 'completed' && (
                        <div className="inline-flex items-center gap-2">
                          <button
                            type="button"
                            onClick={() => handleViewInvoice(payment.stripe_payment_intent_id!)}
                            disabled={loadingReceiptId === payment.stripe_payment_intent_id}
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            {loadingReceiptId === payment.stripe_payment_intent_id ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Eye className="h-3 w-3" />
                            )}
                            {t('viewInvoice')}
                          </button>
                          <button
                            type="button"
                            onClick={() => handleDownloadInvoice(payment.stripe_payment_intent_id!)}
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                          >
                            <Download className="h-3 w-3" />
                            {t('download')}
                          </button>
                        </div>
                      )}
                      {payment.status === 'pending' && (
                        <Link
                          href={
                            payment.payment_type === 'consultation_fee'
                              ? `/cases/${payment.case_id}/consultations/${payment.consultation_request_id}/payment`
                              : `/cases/${payment.case_id}/payment`
                          }
                          className="inline-flex items-center rounded-md bg-cyan-600 px-3 py-1 text-xs font-medium text-white hover:bg-cyan-700"
                        >
                          {t('payNow')}
                        </Link>
                      )}
                      {payment.status === 'failed' && (
                        <Link
                          href={
                            payment.payment_type === 'consultation_fee'
                              ? `/cases/${payment.case_id}/consultations/${payment.consultation_request_id}/payment`
                              : `/cases/${payment.case_id}/payment`
                          }
                          className="inline-flex items-center rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white hover:bg-red-700"
                        >
                          {t('retry')}
                        </Link>
                      )}
                    </td>
                  </tr>
                )
              })
            )}
          </tbody>
        </table>
      </div>

      {/* Pagination */}
      {totalPages > 1 && (
        <div className="flex items-center justify-end gap-1 border-t border-slate-100 px-4 py-3">
          <button
            onClick={() => setPage((p) => Math.max(1, p - 1))}
            disabled={page === 1}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-xs text-slate-500 disabled:opacity-40 hover:bg-slate-50"
          >
            ‹
          </button>
          {Array.from({ length: totalPages }, (_, i) => i + 1).map((n) => (
            <button
              key={n}
              onClick={() => setPage(n)}
              className={`flex h-7 w-7 items-center justify-center rounded-md border text-xs font-medium ${
                n === page
                  ? 'border-cyan-600 bg-cyan-600 text-white'
                  : 'border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {n}
            </button>
          ))}
          <button
            onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
            disabled={page === totalPages}
            className="flex h-7 w-7 items-center justify-center rounded-md border border-slate-200 text-xs text-slate-500 disabled:opacity-40 hover:bg-slate-50"
          >
            ›
          </button>
        </div>
      )}
    </div>
  )
}
