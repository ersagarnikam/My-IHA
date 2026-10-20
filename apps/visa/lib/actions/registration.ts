'use server'

import { createClient } from '@iha/db/server'
import { getStorageObjectMeta } from '@iha/db/storage'
import { checkEmailAlreadyRegistered } from '@iha/db/auth-lookup'
import type { Result } from '@iha/validations'
import { logAuditEvent } from '@iha/db/audit'
import { createLogger } from '@iha/logger'
import {
  lawyerRegistrationSchema,
  type LawyerRegistrationInput,
  type UploadedFileMeta,
} from '@/lib/validations/lawyer-registration'
import {
  registrationAccountStepSchema,
  type RegistrationAccountInput,
} from '@iha/validations/provider-registration'
import { EMAIL_ALREADY_REGISTERED_MESSAGE, GENERIC_AUTH_ERROR } from '@/lib/auth/constants'
import { postAuthRedirect } from '@/lib/actions/auth'

const logger = createLogger('visa:registration')

const AUDIT_APP = 'visa'
const REGISTRATION_BUCKET = 'registration-documents'

// Matches ACCEPTED_MIME / MAX_BYTES in components/registration/document-upload-field.tsx.
const ALLOWED_MIME_TYPES = new Set([
  'application/pdf',
  'image/jpeg',
  'image/png',
  'application/msword',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
])
const ALLOWED_EXTENSIONS = new Set(['.pdf', '.jpg', '.jpeg', '.png', '.doc', '.docx'])
const MAX_FILE_SIZE = 10 * 1024 * 1024
const UPLOAD_ERROR = 'File type not allowed. Please upload a PDF, JPEG, PNG, or DOC/DOCX.'

function getExt(fileName: string): string {
  const dot = fileName.lastIndexOf('.')
  return dot !== -1 ? fileName.slice(dot).toLowerCase() : ''
}

// Re-validates each uploaded file against what Supabase Storage actually
// recorded for it (real size/mimetype from the stored object) rather than the
// mimeType/fileSizeBytes the client reports alongside the wizard's form state
// — same pattern as apps/hospital/lib/actions/registration.ts.
async function verifyUploadedFiles<T extends UploadedFileMeta>(
  supabase: Awaited<ReturnType<typeof createClient>>,
  files: T[],
): Promise<{ ok: true; files: T[] } | { ok: false; error: string }> {
  const verified: T[] = []
  for (const file of files) {
    if (!ALLOWED_EXTENSIONS.has(getExt(file.fileName))) {
      return { ok: false, error: UPLOAD_ERROR }
    }

    const meta = await getStorageObjectMeta(supabase, REGISTRATION_BUCKET, file.filePath)
    if (!meta) {
      return { ok: false, error: 'One or more files could not be verified. Please re-upload.' }
    }
    if (!ALLOWED_MIME_TYPES.has(meta.mimetype)) {
      return { ok: false, error: UPLOAD_ERROR }
    }
    if (meta.size > MAX_FILE_SIZE) {
      return { ok: false, error: 'One or more files exceed the 10 MB limit.' }
    }

    verified.push({ ...file, mimeType: meta.mimetype, fileSizeBytes: meta.size })
  }
  return { ok: true, files: verified }
}

function appUrl(): string {
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3002'
}

function validationError(): Result<never> {
  return { data: null, error: 'Please check your details and try again.' }
}

/**
 * Step 1 of the wizard. Runs signUp() immediately, passing options.data.role
 * so handle_new_patient_user() (packages/db/supabase/migrations/
 * 20260716070000_gate_patient_trigger_by_role.sql) skips creating a stray
 * patients row for a lawyer signup.
 *
 * Email confirmation is required on this project, so signUp() alone does NOT
 * establish a live session — the wizard verifies the OTP immediately
 * afterwards (before any authenticated action like a document upload or the
 * final register_lawyer RPC call) to get a real session.
 *
 * GoTrue's email-enumeration protection makes signUp() succeed silently for
 * an already-registered email, so email_already_registered is checked first
 * to give a clear error instead of letting the wizard advance and fail later.
 */
export async function signUpForRegistration(
  values: RegistrationAccountInput,
  role: 'visa_lawyer',
): Promise<Result<{ email: string; userId: string }>> {
  const parsed = registrationAccountStepSchema.safeParse(values)
  if (!parsed.success) return validationError()

  const { data: alreadyRegistered, error: lookupError } = await checkEmailAlreadyRegistered(
    parsed.data.loginEmail,
  )

  if (lookupError) {
    logger.error(
      { err: lookupError, email: parsed.data.loginEmail },
      'signUpForRegistration email_already_registered RPC failed',
    )
    return { data: null, error: GENERIC_AUTH_ERROR }
  }
  if (alreadyRegistered) return { data: null, error: EMAIL_ALREADY_REGISTERED_MESSAGE }

  const supabase = await createClient()
  const { data, error } = await supabase.auth.signUp({
    email: parsed.data.loginEmail,
    password: parsed.data.password,
    options: { data: { role }, emailRedirectTo: `${appUrl()}/auth/callback` },
  })

  if (error || !data.user) return { data: null, error: GENERIC_AUTH_ERROR }

  return { data: { email: parsed.data.loginEmail, userId: data.user.id }, error: null }
}

export async function submitLawyerRegistration(
  values: LawyerRegistrationInput,
): Promise<Result<{ redirectTo: string }>> {
  const parsed = lawyerRegistrationSchema.safeParse(values)
  if (!parsed.success) return validationError()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Your session expired — please sign up again.' }

  const verifiedCertificates = await verifyUploadedFiles(supabase, parsed.data.certificates)
  if (!verifiedCertificates.ok) return { data: null, error: verifiedCertificates.error }

  const { error } = await supabase.rpc('register_lawyer', {
    p_name: parsed.data.name,
    p_lawyer_type: parsed.data.lawyerType,
    p_registration_number: parsed.data.registrationNumber,
    p_abn_number: parsed.data.abnNumber,
    p_immigration_law_certification: parsed.data.immigrationLawCertification,
    p_contact_phone: parsed.data.phone,
    p_address: parsed.data.address,
    p_city: parsed.data.city,
    p_zip_code: parsed.data.zipCode,
    p_certificates: verifiedCertificates.files,
  })

  if (error) {
    logger.error({ err: error, userId: user.id }, 'submitLawyerRegistration register_lawyer RPC failed')
    return { data: null, error: GENERIC_AUTH_ERROR }
  }

  const { error: updateUserError } = await supabase.auth.updateUser({
    data: { full_name: parsed.data.name },
  })
  if (updateUserError) {
    logger.error(
      { err: updateUserError, userId: user.id },
      'submitLawyerRegistration failed to sync full_name to auth user metadata',
    )
  }

  await logAuditEvent({
    app: AUDIT_APP,
    action: 'registration.lawyer_submitted',
    entityType: 'user',
    entityId: user.id,
  })

  return { data: { redirectTo: await postAuthRedirect(user.id) }, error: null }
}

export async function resubmitLawyerRegistration(
  lawyerId: string,
  values: LawyerRegistrationInput,
): Promise<Result<{ success: true }>> {
  const parsed = lawyerRegistrationSchema.safeParse(values)
  if (!parsed.success) return validationError()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) return { data: null, error: 'Your session expired — please sign in again.' }

  const verifiedCertificates = await verifyUploadedFiles(supabase, parsed.data.certificates)
  if (!verifiedCertificates.ok) return { data: null, error: verifiedCertificates.error }

  const { error } = await supabase.rpc('resubmit_lawyer_registration', {
    p_lawyer_id: lawyerId,
    p_name: parsed.data.name,
    p_lawyer_type: parsed.data.lawyerType,
    p_registration_number: parsed.data.registrationNumber,
    p_abn_number: parsed.data.abnNumber,
    p_immigration_law_certification: parsed.data.immigrationLawCertification,
    p_contact_phone: parsed.data.phone,
    p_address: parsed.data.address,
    p_city: parsed.data.city,
    p_zip_code: parsed.data.zipCode,
    p_certificates: verifiedCertificates.files,
  })

  if (error) {
    logger.error({ err: error, lawyerId }, 'resubmitLawyerRegistration RPC failed')
    return { data: null, error: GENERIC_AUTH_ERROR }
  }

  const { error: updateUserError } = await supabase.auth.updateUser({
    data: { full_name: parsed.data.name },
  })
  if (updateUserError) {
    logger.error(
      { err: updateUserError, lawyerId },
      'resubmitLawyerRegistration failed to sync full_name to auth user metadata',
    )
  }

  await logAuditEvent({
    app: AUDIT_APP,
    action: 'registration.resubmitted',
    entityType: 'lawyer',
    entityId: lawyerId,
  })

  return { data: { success: true }, error: null }
}
