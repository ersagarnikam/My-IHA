'use client'

import { useState } from 'react'
import { Download, Eye, FileText, Loader2 } from 'lucide-react'
import type { DoctorFeePaymentRow } from '@iha/db/doctor-fees'

function formatAUD(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount)
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

const FEE_TYPE_LABEL: Record<string, string> = {
  registration: 'Registration Fee',
  annual: 'Annual Renewal Fee',
}

const STATUS_STYLES: Record<string, string> = {
  completed: 'bg-emerald-50 text-emerald-700',
  pending: 'bg-amber-50 text-amber-700',
  failed: 'bg-red-50 text-red-700',
}

type Props = {
  payments: DoctorFeePaymentRow[]
}

export function InvoicesTab({ payments }: Props) {
  const [loadingId, setLoadingId] = useState<string | null>(null)

  async function handleView(paymentId: string) {
    setLoadingId(paymentId)
    try {
      const res = await fetch(`/api/fees/invoice?paymentId=${encodeURIComponent(paymentId)}`)
      if (!res.ok) return
      const blob = await res.blob()
      const url = URL.createObjectURL(blob)
      window.open(url, '_blank', 'noopener,noreferrer')
    } finally {
      setLoadingId(null)
    }
  }

  function handleDownload(paymentId: string) {
    window.location.assign(`/api/fees/invoice?paymentId=${encodeURIComponent(paymentId)}&download=1`)
  }

  return (
    <div className="space-y-5">
      <div>
        <h2 className="text-base font-semibold text-slate-900">Invoices</h2>
        <p className="mt-0.5 text-sm text-slate-500">
          Your registration and annual fee payment history.
        </p>
      </div>

      {payments.length === 0 ? (
        <div className="flex flex-col items-center gap-3 rounded-xl border border-slate-200 bg-white py-16 text-center">
          <div className="grid h-12 w-12 place-items-center rounded-full bg-slate-100">
            <FileText className="h-6 w-6 text-slate-400" />
          </div>
          <p className="text-sm font-medium text-slate-700">No invoices yet</p>
          <p className="text-xs text-slate-400">Your payment history will appear here once you&apos;ve been charged.</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-100 text-left text-xs font-medium text-slate-400">
                <th className="px-4 py-3 font-medium">Date</th>
                <th className="px-4 py-3 font-medium">Type</th>
                <th className="px-4 py-3 font-medium">Amount</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 text-right font-medium">Action</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((payment) => (
                <tr key={payment.id} className="border-b border-slate-50 last:border-0 hover:bg-slate-50">
                  <td className="px-4 py-3.5 text-slate-500">
                    {formatDate(payment.paid_at ?? payment.created_at)}
                  </td>
                  <td className="px-4 py-3.5 text-slate-600">
                    {FEE_TYPE_LABEL[payment.fee_type] ?? payment.fee_type}
                  </td>
                  <td className="px-4 py-3.5 font-medium text-slate-900">{formatAUD(payment.amount_aud)}</td>
                  <td className="px-4 py-3.5">
                    <span
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${STATUS_STYLES[payment.status] ?? 'bg-slate-100 text-slate-600'}`}
                    >
                      {payment.status}
                    </span>
                  </td>
                  <td className="px-4 py-3.5 text-right">
                    {payment.status === 'completed' && (
                      <div className="inline-flex items-center gap-2">
                        <button
                          type="button"
                          onClick={() => handleView(payment.id)}
                          disabled={loadingId === payment.id}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                        >
                          {loadingId === payment.id ? (
                            <Loader2 className="h-3 w-3 animate-spin" />
                          ) : (
                            <Eye className="h-3 w-3" />
                          )}
                          View
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDownload(payment.id)}
                          className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                        >
                          <Download className="h-3 w-3" />
                          Download
                        </button>
                      </div>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
