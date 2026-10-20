import { NextResponse } from 'next/server'
import { createClient } from '@iha/db/server'
import { createCaseDocumentSignedUrl } from '@iha/db/cases'
import { createLogger } from '@iha/logger'

const logger = createLogger('hospital:api:documents')

type Params = { params: Promise<{ documentId: string }> }

// Streams a case document through the app server so the browser never sees
// the underlying Supabase Storage path (which is prefixed with the raw
// patient id, required by the storage RLS policy) — see the "never expose
// patient IDs in URLs" rule.
export async function GET(request: Request, { params }: Params): Promise<Response> {
  const { documentId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  const { data: doctorData } = await supabase.from('doctors').select('id').eq('user_id', user.id).maybeSingle()
  const doctor = doctorData as unknown as { id: string } | null
  if (!doctor) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 403 })
  }

  const { data: docData } = await supabase
    .from('case_documents')
    .select('file_path, file_name, mime_type, case_id')
    .eq('id', documentId)
    .maybeSingle()
  const doc = docData as unknown as {
    file_path: string
    file_name: string
    mime_type: string
    case_id: string
  } | null

  if (!doc) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { data: assignmentData } = await supabase
    .from('doctor_case_assignments')
    .select('id')
    .eq('case_id', doc.case_id)
    .eq('doctor_id', doctor.id)
    .in('status', ['invited', 'accepted'])
    .maybeSingle()

  if (!assignmentData) {
    return NextResponse.json({ error: 'Not found' }, { status: 404 })
  }

  const { url, error } = await createCaseDocumentSignedUrl(doc.file_path, 60)
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
