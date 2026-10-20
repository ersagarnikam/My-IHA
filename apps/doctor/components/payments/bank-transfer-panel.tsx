'use client'

import { useState } from 'react'
import { ChevronDown, ChevronUp } from 'lucide-react'

function formatAUD(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD' }).format(amount)
}

type Props = {
  amountAud: number
  reference: string
}

/** Manual bank transfer / cheque instructions — informational only, not wired to
 * any automated confirmation. IHA reconciles these against the reference
 * manually and marks the doctor_fee_payments row completed by hand, the same
 * offline pattern used on the patient side's bank-transfer panel. */
export function BankTransferPanel({ amountAud, reference }: Props) {
  const [open, setOpen] = useState(false)

  return (
    <div className="rounded-xl border border-slate-200 bg-white">
      <button
        type="button"
        onClick={() => setOpen((p) => !p)}
        className="flex w-full items-center justify-between px-5 py-4 text-sm font-medium text-slate-700"
      >
        Pay by bank transfer or cheque
        {open ? (
          <ChevronUp className="h-4 w-4 text-slate-400" />
        ) : (
          <ChevronDown className="h-4 w-4 text-slate-400" />
        )}
      </button>
      {open && (
        <div className="border-t border-slate-100 px-5 pb-5 pt-4 text-sm text-slate-600">
          <p className="mb-3 text-slate-500">
            Prefer to pay by bank transfer? Use the details below and include the reference so we can match
            your payment. Your dashboard unlocks once we&apos;ve confirmed receipt — this can take 1–2 business
            days.
          </p>
          <dl className="space-y-2">
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-slate-400">Bank</dt>
              <dd className="font-medium">ANZ Bank Australia</dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-slate-400">Account name</dt>
              <dd className="font-medium">International Health Australia Pty Ltd</dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-slate-400">BSB</dt>
              <dd className="font-medium font-mono">012-345</dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-slate-400">Account number</dt>
              <dd className="font-medium font-mono">123456789</dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-slate-400">Reference</dt>
              <dd className="font-medium font-mono text-cyan-700">{reference}</dd>
            </div>
            <div className="grid grid-cols-[140px_1fr] gap-2">
              <dt className="text-slate-400">Amount</dt>
              <dd className="font-medium">{formatAUD(amountAud)}</dd>
            </div>
          </dl>
          <p className="mt-4 text-xs text-slate-400">
            Paying by cheque instead? Make it payable to &quot;International Health Australia Pty Ltd&quot;,
            write the reference above on the back, and contact support for the mailing address.
          </p>
        </div>
      )}
    </div>
  )
}
