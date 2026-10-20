import { redirect } from 'next/navigation'
import { fetchSpecialtyLabelMap } from '@iha/db/specialties'
import { fetchCasesForPatientId, fetchAllDocumentsForPatientId } from '@/lib/repositories/cases'
import { fetchAllVisaApplicationDocumentsForPatientId } from '@/lib/repositories/visa'
import { fetchCurrentPatientContext } from '@/lib/repositories/patients'
import { DocumentsClient } from '@/components/documents/documents-client'

export default async function DocumentsPage() {
  const context = await fetchCurrentPatientContext()
  if (!context) redirect('/login')

  const patientId = context.patient?.id ?? ''

  const [caseDocuments, visaDocuments, cases, specialtyLabelMap] = await Promise.all([
    patientId ? fetchAllDocumentsForPatientId(patientId) : Promise.resolve([]),
    patientId ? fetchAllVisaApplicationDocumentsForPatientId(patientId) : Promise.resolve([]),
    patientId ? fetchCasesForPatientId(patientId) : Promise.resolve([]),
    fetchSpecialtyLabelMap(),
  ])

  const documents = [...caseDocuments, ...visaDocuments].sort(
    (a, b) => new Date(b.uploaded_at).getTime() - new Date(a.uploaded_at).getTime(),
  )

  return (
    <DocumentsClient
      documents={documents}
      cases={cases}
      specialtyLabelMap={specialtyLabelMap}
    />
  )
}
