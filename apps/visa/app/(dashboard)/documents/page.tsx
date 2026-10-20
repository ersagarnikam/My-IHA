import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import { createVisaDocumentSignedUrl, fetchLawyerIssuedDocumentsForCases } from '@iha/db/visa'
import { getAccountForUser } from '@/lib/auth/account'
import { fetchCasesForLawyer } from '@/lib/data/cases'
import { ApprovedVisaDocumentsTable, type ApprovedCaseRow } from '@/components/documents/approved-visa-documents-table'

export default async function DocumentsPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')

  const { data: allCases } = await fetchCasesForLawyer(account.id)
  const approvedCases = allCases.filter((c) => c.status === 'approved')

  const { data: documents } = await fetchLawyerIssuedDocumentsForCases(approvedCases.map((c) => c.case_id))
  const documentByCase = new Map(documents.map((d) => [d.case_id, d]))

  const rows: ApprovedCaseRow[] = await Promise.all(
    approvedCases.map(async (c) => {
      const doc = documentByCase.get(c.case_id) ?? null
      if (!doc) return { ...c, document: null }
      const { url } = await createVisaDocumentSignedUrl(doc.file_path)
      return { ...c, document: { ...doc, signedUrl: url } }
    }),
  )

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-lg font-semibold text-slate-900">Documents</h1>
        <p className="mt-0.5 text-sm text-slate-500">
          Upload the approved visa for each case once its visa application has been marked Approved. The patient is
          notified and can download it immediately.
        </p>
      </div>

      {approvedCases.length === 0 ? (
        <div className="rounded-xl border border-dashed border-slate-300 bg-white p-10 text-center">
          <p className="text-sm font-medium text-slate-500">No approved cases yet.</p>
          <p className="mt-1 text-sm text-slate-400">
            Cases appear here once you mark their visa application Approved from the case detail page.
          </p>
        </div>
      ) : (
        <ApprovedVisaDocumentsTable cases={rows} />
      )}
    </div>
  )
}
