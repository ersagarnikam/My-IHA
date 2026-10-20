import { Wallet } from 'lucide-react'

function formatAUD(amount: number) {
  return new Intl.NumberFormat('en-AU', { style: 'currency', currency: 'AUD', maximumFractionDigits: 0 }).format(
    amount,
  )
}

/** Persistent reminder anchored to the wizard sidebar, visible on every step. */
export function RegistrationFeeSidebarNotice({ amountAud }: { amountAud: number }) {
  return (
    <div className="w-full rounded-lg border border-cyan-200 bg-white p-4 text-left shadow-sm">
      <div className="flex items-center gap-2 text-cyan-700">
        <Wallet className="h-4 w-4" />
        <span className="text-xs font-semibold uppercase tracking-wide">Registration fee</span>
      </div>
      <p className="mt-1.5 text-lg font-bold text-slate-900">{formatAUD(amountAud)}</p>
      <p className="mt-1 text-xs leading-relaxed text-slate-500">
        Charged only after MTA reviews and approves your application — nothing is charged today.
      </p>
    </div>
  )
}

/** Explicit restatement at the point of commitment, shown just above the Agreement step's submit action. */
export function RegistrationFeeAgreementNotice({ amountAud }: { amountAud: number }) {
  return (
    <div className="mb-5 flex items-start gap-3 rounded-lg border border-cyan-200 bg-cyan-50 px-4 py-3">
      <Wallet className="mt-0.5 h-4 w-4 shrink-0 text-cyan-700" />
      <p className="text-sm text-cyan-900">
        <span className="font-semibold">One-time registration fee: {formatAUD(amountAud)}.</span> By submitting,
        you acknowledge this fee is charged only once MTA approves your application — not today, and not if your
        application isn&apos;t approved.
      </p>
    </div>
  )
}
