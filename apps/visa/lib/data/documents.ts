import { createClient } from '@iha/db/server'
import type { VisaDocumentRow } from '@iha/db/visa'

export type { DocumentRequestWithStatus } from '@iha/db/visa'
export { fetchDocumentRequestsForCase } from '@iha/db/visa'

/** All documents (patient-uploaded + hospital-generated) for a case, oldest first. */
export async function fetchVisaDocumentsForCase(
  caseId: string,
): Promise<{ data: VisaDocumentRow[]; error: string | null }> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('visa_documents')
    .select('*')
    .eq('case_id', caseId)
    .order('uploaded_at', { ascending: true })
  if (error) return { data: [], error: error.message }
  return { data: (data ?? []) as unknown as VisaDocumentRow[], error: null }
}
