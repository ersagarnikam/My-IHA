import { NextResponse } from 'next/server'
import { createClient } from '@iha/db/server'
import { createVisaDocumentSignedUrl } from '@iha/db/visa'
import { createLogger } from '@iha/logger'

const logger = createLogger('patient:api:documents:visa')

type Params = { params: Promise<{ documentId: string }> }

// Mirrors /api/documents/[documentId] (case_documents) but for visa_documents
// — streams through the app server rather than exposing a signed storage
// URL directly to the browser, same rationale as that route.
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { documentId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthenticated' }, { status: 401 })
  }

  const { data: patientData } = await supabase
    .from('patients')
    .select('id')
    .eq('user_id', user.id)
    .single()
  const patient = patientData as unknown as { id: string } | null
  if (!patient) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { data: docData } = await supabase
    .from('visa_documents')
    .select('file_path, file_name, mime_type, patient_id')
    .eq('id', documentId)
    .maybeSingle()
  const doc = docData as unknown as {
    file_path: string
    file_name: string
    mime_type: string
    patient_id: string
  } | null

  if (!doc || doc.patient_id !== patient.id) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { url, error } = await createVisaDocumentSignedUrl(doc.file_path)
  if (error || !url) {
    logger.error({ err: error }, 'documents route: failed to sign url')
    return NextResponse.json({ error: 'Failed to load document' }, { status: 500 })
  }

  const fileRes = await fetch(url)
  if (!fileRes.ok || !fileRes.body) {
    return NextResponse.json({ error: 'Failed to load document' }, { status: 502 })
  }

  const { searchParams } = new URL(request.url)
  const disposition = searchParams.get('download') === '1' ? 'attachment' : 'inline'

  return new NextResponse(fileRes.body, {
    headers: {
      'Content-Type': doc.mime_type,
      'Content-Disposition': `${disposition}; filename="${doc.file_name.replace(/"/g, '')}"`,
      'Cache-Control': 'private, no-store',
    },
  })
}
