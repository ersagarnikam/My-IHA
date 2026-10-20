import { notFound, redirect } from 'next/navigation'
import Link from 'next/link'
import { ArrowLeft, CheckCircle2, Video } from 'lucide-react'
import { getTranslations } from 'next-intl/server'
import { getAuthUser } from '@iha/db/server'
import { fetchCaseForCurrentUser } from '@/lib/repositories/cases'
import { fetchConsultationRequestById, CONSULTATION_FEE_AUD } from '@iha/db/consultations'
import { ConsultationPaymentClient } from '@/components/payments/consultation-payment-client'
import { SlotTimeZones } from '@/components/treatments/slot-time-zones'

export default async function ConsultationPaymentPage({
  params,
  searchParams,
}: {
  params: Promise<{ caseId: string; requestId: string }>
  searchParams: Promise<{ redirect_status?: string }>
}) {
  const { caseId, requestId } = await params
  const { redirect_status } = await searchParams

  const t = await getTranslations('paymentPage')
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const caseData = await fetchCaseForCurrentUser(caseId)
  if (!caseData) notFound()

  const { data: consultation } = await fetchConsultationRequestById(requestId)
  if (!consultation || consultation.case_id !== caseId) notFound()

  if (consultation.status === 'scheduled') {
    redirect(`/cases/${caseId}`)
  }

  if (consultation.status !== 'slot_selected') {
    redirect(`/cases/${caseId}`)
  }

  const selectedSlot = consultation.slots.find((s) => s.id === consultation.selected_slot_id)

  return (
    <div className="space-y-4">
      <div>
        <Link
          href={`/cases/${caseId}`}
          className="mb-3 inline-flex items-center gap-1.5 text-sm text-slate-500 hover:text-slate-800"
        >
          <ArrowLeft className="h-4 w-4" />
          {caseData.reference_number}
        </Link>
        <h1 className="text-xl font-semibold text-slate-900">{t('consultationTitle')}</h1>
      </div>

      <div className="rounded-xl border border-slate-200 bg-white p-5">
        <h2 className="mb-1 flex items-center gap-2 text-base font-semibold text-slate-900">
          <Video className="h-4 w-4 text-cyan-600" />
          {t('onlineConsultation')}
        </h2>
        {selectedSlot && (
          <div className="mb-4 text-sm text-slate-500">
            <p className="mb-1">{t('selectedTimeLabel')}</p>
            <SlotTimeZones startIso={selectedSlot.slot_time} endIso={selectedSlot.slot_end_time} />
          </div>
        )}
        <table className="w-full text-sm">
          <tbody>
            <tr>
              <td className="pt-2 text-base font-bold text-slate-900">{t('consultationFee')}</td>
              <td className="pt-2 text-right text-base font-bold text-cyan-700">
                ${CONSULTATION_FEE_AUD.toFixed(2)} AUD
              </td>
            </tr>
          </tbody>
        </table>
      </div>

      <ConsultationPaymentClient
        caseId={caseId}
        consultationRequestId={requestId}
        redirectStatus={redirect_status ?? null}
      />

      {redirect_status === 'succeeded' && (
        <div className="flex items-start gap-2 rounded-lg border border-emerald-200 bg-emerald-50 p-3 text-sm text-emerald-700">
          <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0" />
          {t('consultationPaymentReceived')}
        </div>
      )}
    </div>
  )
}
