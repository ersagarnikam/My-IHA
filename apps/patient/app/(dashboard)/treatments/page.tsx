import { redirect } from 'next/navigation'
import { getAuthUser } from '@iha/db/server'
import { getTranslations, getLocale } from 'next-intl/server'
import { fetchAllTreatmentOptionsForCurrentUser } from '@/lib/repositories/treatments'
import { fetchConsultationRequestsForOptions } from '@/lib/repositories/consultations'
import { fetchSpecialtyLabelMap } from '@iha/db/specialties'
import { TreatmentsListClient } from '@/components/treatments/treatments-list-client'
import { getSpecialtyLabel } from '@/lib/specialty-label'
import type { TreatmentOptionWithCaseInfo } from '@iha/db/treatments'

export default async function TreatmentsPage() {
  const user = await getAuthUser()
  if (!user) redirect('/login')

  const [options, t, locale, specialtyLabelMap] = await Promise.all([
    fetchAllTreatmentOptionsForCurrentUser(),
    getTranslations('treatments'),
    getLocale(),
    fetchSpecialtyLabelMap(),
  ])

  // Group by case, preserving insertion order
  const groupMap = new Map<
    string,
    { caseId: string; referenceNumber: string; specialty: string; options: TreatmentOptionWithCaseInfo[] }
  >()

  for (const option of options) {
    const { reference_number, specialty, specialty_other } = option.cases
    const displaySpecialty =
      specialty === 'Other' && specialty_other
        ? specialty_other
        : getSpecialtyLabel(specialty, locale, specialtyLabelMap)

    if (!groupMap.has(option.case_id)) {
      groupMap.set(option.case_id, {
        caseId: option.case_id,
        referenceNumber: reference_number,
        specialty: displaySpecialty,
        options: [],
      })
    }
    groupMap.get(option.case_id)!.options.push(option)
  }

  const groups = Array.from(groupMap.values())
  const consultations = await fetchConsultationRequestsForOptions(options.map((o) => o.id))

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-xl font-semibold text-slate-900">{t('title')}</h1>
        <p className="mt-1 text-sm text-slate-500">{t('subtitle')}</p>
      </div>

      <TreatmentsListClient groups={groups} consultations={consultations} specialtyLabelMap={specialtyLabelMap} />
    </div>
  )
}
