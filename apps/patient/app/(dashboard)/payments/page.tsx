import { redirect } from 'next/navigation'
import { getAuthUser } from '@iha/db/server'
import { getTranslations } from 'next-intl/server'
import { fetchPaymentsForPatient } from '@iha/db/payments'
import { fetchPatientByUserId } from '@/lib/repositories/patients'
import { PaymentsHistoryClient } from '@/components/payments/payments-history-client'

export default async function PaymentsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const [patient, t] = await Promise.all([
    fetchPatientByUserId(user.id),
    getTranslations('payments'),
  ])
  if (!patient) redirect('/profile/setup')

  const { data: payments } = await fetchPaymentsForPatient(patient.id)

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{t('subtitle')}</p>
      </div>
      <PaymentsHistoryClient payments={payments} />
    </div>
  )
}
