'use server'

import { createClient } from '@iha/db/server'
import type { Result } from '@iha/validations'
import { getTranslations } from 'next-intl/server'
import { fetchPatientByUserId } from '@/lib/repositories/patients'
import { createLogger } from '@iha/logger'

const logger = createLogger('patient:upload')

const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'image/webp',
])
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.webp'])
const MAX_FILE_SIZE = 10 * 1024 * 1024

// Buckets this action is allowed to write to, and how each one's storage RLS
// scopes the first path segment — see the "Patients can upload own case
// documents" / "Patients upload own visa documents" policies in
// packages/db/supabase/migrations. Both prefixes are derived from the
// authenticated session server-side, never from client input.
const BUCKET_PREFIX = {
  'case-documents': 'patient',
  'visa-documents': 'user',
} as const
type UploadBucket = keyof typeof BUCKET_PREFIX

function isUploadBucket(value: FormDataEntryValue | null): value is UploadBucket {
  return typeof value === 'string' && value in BUCKET_PREFIX
}

function getExt(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot !== -1 ? fileName.slice(dot).toLowerCase() : ''
}

function sanitize(name: string): string {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

export type UploadedDocument = {
  file_name: string
  file_path: string
  file_size_bytes: number
  mime_type: string
}

// Server Action wrapping every document upload site in the patient portal.
// Client Components must never mutate Supabase Storage directly — this is
// the one place that does, so validation and the storage path prefix stay
// server-controlled instead of trusting the browser.
export async function uploadDocumentFile(formData: FormData): Promise<Result<UploadedDocument>> {
  const t = await getTranslations('actionErrors')

  const supabase = await createClient()
  const { data: { user } } = await supabase.auth.getUser()
  if (!user) return { data: null, error: t('common.unauthenticated') }

  const file = formData.get('file')
  const bucketValue = formData.get('bucket')
  const subPathValue = formData.get('subPath')

  if (!(file instanceof File)) return { data: null, error: t('common.uploadErrorFileType') }
  if (!isUploadBucket(bucketValue)) return { data: null, error: t('common.uploadErrorFileType') }

  if (!ALLOWED_EXTENSIONS.has(getExt(file.name)) || !ALLOWED_MIME_TYPES.has(file.type)) {
    return { data: null, error: t('common.uploadErrorFileType') }
  }
  if (file.size > MAX_FILE_SIZE) {
    return { data: null, error: t('common.fileSizeLimitExceeded') }
  }

  let prefix: string
  if (BUCKET_PREFIX[bucketValue] === 'patient') {
    const patient = await fetchPatientByUserId(user.id)
    if (!patient) return { data: null, error: t('cases.patientProfileNotFound') }
    prefix = patient.id
  } else {
    prefix = user.id
  }

  const subPath = typeof subPathValue === 'string' && subPathValue.length > 0
    ? `${subPathValue.split('/').map(sanitize).join('/')}/`
    : ''
  const path = `${prefix}/${subPath}${Date.now()}-${sanitize(file.name)}`

  const { error } = await supabase.storage.from(bucketValue).upload(path, file, {
    contentType: file.type,
  })

  if (error) {
    logger.error({ err: error }, 'uploadDocumentFile failed')
    return { data: null, error: t('common.uploadFailed') }
  }

  return {
    data: {
      file_name: file.name,
      file_path: path,
      file_size_bytes: file.size,
      mime_type: file.type,
    },
    error: null,
  }
}
