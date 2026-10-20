import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2 } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getAuthUser } from '@iha/db/server'
import { fetchCaseForCurrentUser } from '@/lib/repositories/cases'
import { fetchTreatmentOptionsForCurrentCase } from '@/lib/repositories/treatments'
import { PaymentClient } from '@/components/payments/payment-client'

const PAYMENT_ALLOWED_STATUSES = ['treatment_confirmed', 'payment_confirmed']

export default async function PaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string }>
  searchParams: Promise<{ redirect_status?: string }>
}) {
  const { caseId } = await params
  const { redirect_status } = await searchParams

  const t = await getTranslations('paymentPage')
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const caseData = await fetchCaseForCurrentUser(caseId)
  if (!caseData) notFound()

  if (!PAYMENT_ALLOWED_STATUSES.includes(caseData.status)) {
    redirect(`/cases/${caseId}`)
  }

  // Fetch confirmed treatment option
  const treatmentOptions = await fetchTreatmentOptionsForCurrentCase(caseId)
  const treatmentOption = treatmentOptions.find((o) => o.is_selected)

  if (!treatmentOption) {
    redirect(`/cases/${caseId}`)
  }

  const costItems = treatmentOption.cost_breakdown?.items ?? []
  const totalAud = treatmentOption.cost_breakdown?.total ?? 0
  const hospitalName = treatmentOption.hospitals?.name ?? ''

  // A successful Stripe redirect always wins over the DB status: the
  // payment_intent.succeeded webhook races the browser back to this page and
  // often flips the case to payment_confirmed before the redirect completes,
  // which would otherwise show the generic "already confirmed" copy instead
  // of the actual success screen for the payment the patient just made.
  const justPaid = redirect_status === 'succeeded'
  const isAlreadyPaid = caseData.status === 'payment_confirmed'
  const showAlreadyPaidNotice = isAlreadyPaid && !justPaid

  return (
    <div className="space-y-4">
      {/* Back link + header */}
      <div>
        <Link
          href={`/cases/${caseId}`}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          {caseData.reference_number}
        </Link>
        <div className="flex items-center justify-between gap-3">
          <div>
            <h1 className="text-xl font-semibold text-slate-900">{t('title')}</h1>
            <p className="mt-0.5 text-sm text-slate-500">{hospitalName}</p>
          </div>
          {isAlreadyPaid && (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-emerald-50 px-3 py-1 text-sm font-medium text-emerald-700">
              <CheckCircle2 className="h-4 w-4" />
              {t('paymentConfirmedBadge')}
            </span>
          )}
        </div>
      </div>

      {showAlreadyPaidNotice ? (
        <div className="rounded-xl border border-slate-200 bg-white p-6 text-center">
          <div className="mx-auto mb-4 grid h-14 w-14 place-items-center rounded-full bg-emerald-50">
            <CheckCircle2 className="h-7 w-7 text-emerald-600" />
          </div>
          <h2 className="text-base font-semibold text-slate-900">{t('alreadyPaidTitle')}</h2>
          <p className="mt-1 text-sm text-slate-500">
            {t('alreadyPaidBody')}
          </p>
        </div>
      ) : (
        <PaymentClient
          caseId={caseId}
          referenceNumber={caseData.reference_number}
          costItems={costItems}
          totalAud={totalAud}
          hospitalName={hospitalName}
          treatmentSummary={treatmentOption.treatment_summary}
          redirectStatus={redirect_status ?? null}
        />
      )}
    </div>
  )
}
