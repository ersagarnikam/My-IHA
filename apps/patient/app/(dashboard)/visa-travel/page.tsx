import { redirect } from 'next/navigation'
import { getAuthUser } from '@iha/db/server'
import { getTranslations } from 'next-intl/server'
import { fetchAllVisaSubmissionsWithCase, fetchSentHospitalDocumentsForCases, type HospitalLetterType } from '@iha/db/visa'
import { fetchCasesForCurrentUser } from '@/lib/repositories/cases'
import { fetchPatientByUserId } from '@/lib/repositories/patients'
import { TabBar } from '@/components/visa-travel/tab-bar'
import { TravelGuide } from '@/components/visa-travel/travel-guide'
import { VisaManagement } from '@/components/visa-travel/visa-management'

export default async function VisaTravelPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>
}) {
  const { tab } = await searchParams
  const activeTab = tab === 'visa' ? 'visa' : 'travel'

  const user = await getAuthUser()
  if (!user) redirect('/login')

  let submissions: Awaited<ReturnType<typeof fetchAllVisaSubmissionsWithCase>>['data'] = []
  let cases: Awaited<ReturnType<typeof fetchCasesForCurrentUser>> = []
  let lettersReceivedByCase: Record<string, boolean> = {}

  const REQUIRED_LETTERS: HospitalLetterType[] = ['hospital_invitation', 'appointment_confirmation']

  if (activeTab === 'visa') {
    const patient = await fetchPatientByUserId(user.id)
    const patientId = patient?.id

    if (patientId) {
      const [casesResult, submissionsResult] = await Promise.all([
        fetchCasesForCurrentUser(),
        fetchAllVisaSubmissionsWithCase(patientId),
      ])
      cases       = casesResult
      submissions = submissionsResult.data

      const caseIds = Array.from(new Set(cases.map((c) => c.id)))
      const { data: letters } = await fetchSentHospitalDocumentsForCases(caseIds)
      const receivedTypesByCase = new Map<string, Set<HospitalLetterType>>()
      for (const letter of letters) {
        const types = receivedTypesByCase.get(letter.case_id) ?? new Set<HospitalLetterType>()
        types.add(letter.category)
        receivedTypesByCase.set(letter.case_id, types)
      }
      lettersReceivedByCase = Object.fromEntries(
        caseIds.map((id) => [
          id,
          REQUIRED_LETTERS.every((t) => receivedTypesByCase.get(id)?.has(t)),
        ]),
      )
    }
  }

  const t = await getTranslations('visaTravel')

  return (
    <div className="space-y-5">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="mt-0.5 text-sm text-slate-500">{t('subtitle')}</p>
      </div>

      <TabBar activeTab={activeTab} />

      {activeTab === 'travel' ? (
        <TravelGuide />
      ) : (
        <VisaManagement submissions={submissions} cases={cases} lettersReceivedByCase={lettersReceivedByCase} />
      )}
    </div>
  )
}
