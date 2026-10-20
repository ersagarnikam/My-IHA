import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import { fetchHospitalGeneratedDocumentsForCases } from '@iha/db/visa'
import { getAccountForUser } from '@/lib/auth/account'
import { fetchVisaEligibleCasesForHospital } from '@/lib/data/case-management'
import { DocumentsTable } from '@/components/documents/documents-table'

export default async function DocumentsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')
  if (account.role !== 'hospital') redirect('/cases')

  const { data: cases } = await fetchVisaEligibleCasesForHospital(account.id)
  const { data: documents } = await fetchHospitalGeneratedDocumentsForCases(cases.map((c) => c.caseId))

  const documentsByCase = new Map<string, typeof documents>()
  for (const doc of documents) {
    const existing = documentsByCase.get(doc.case_id)
    if (existing) existing.push(doc)
    else documentsByCase.set(doc.case_id, [doc])
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Documents</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Generate the Hospital Invitation Letter and Appointment Confirmation Letter across all of your cases'
          visa applications.
        </p>
      </div>

      {cases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-500">No cases are eligible for visa documents yet.</p>
          <p className="mt-1 text-sm text-slate-400">
            Cases appear here once the patient has confirmed treatment and payment.
          </p>
        </div>
      ) : (
        <DocumentsTable cases={cases} documentsByCase={documentsByCase} />
      )}
    </div>
  )
}
