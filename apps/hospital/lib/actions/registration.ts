'use server'

import { createClient } from '@iha/db/server'
import { getStorageObjectMeta } from '@iha/db/storage'
import { checkEmailAlreadyRegistered } from '@iha/db/auth-lookup'
import type { Result } from '@iha/validations'
import { logAuditEvent } from '@iha/db/audit'
import { createLogger } from '@iha/logger'
import {
  hospitalRegistrationSchema,
  type HospitalRegistrationInput,
  type UploadedFileMeta,
} from '@/lib/validations/hospital-registration'
import {
  registrationAccountStepSchema,
  type RegistrationAccountInput,
} from '@iha/validations/provider-registration'
import { EMAIL_ALREADY_REGISTERED_MESSAGE, GENERIC_AUTH_ERROR } from '@/lib/auth/constants'
import { postAuthRedirect } from '@/lib/actions/auth'

const logger = createLogger('hospital:registration')

const AUDIT_APP = 'hospital'
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
// — a client can lie about those fields even though the bucket itself already
// rejects disallowed uploads at write time. Same pattern as
// apps/patient/lib/actions/{cases,visa}.ts. Returns the files with their
// mimeType/fileSizeBytes overwritten with the verified values.
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
  return process.env.NEXT_PUBLIC_APP_URL ?? 'http://localhost:3001'
}

function validationError(): Result<never> {
  return { data: null, error: 'Please check your details and try again.' }
}

/**
 * Step 1 of the wizard. Runs signUp() immediately (before any of the
 * profile/entity fields are collected), passing options.data.role so the
 * on_auth_user_created_patient trigger (packages/db/supabase/migrations/
 * 20260601120000_create_patients_table.sql) skips creating a patients row
 * for a hospital signup.
 *
 * Email confirmation is required on this project, so signUp() alone does
 * NOT establish a live session — the wizard verifies the OTP immediately
 * afterwards (before any authenticated action like a document upload or the
 * final register_hospital RPC call) to get a real session, matching the
 * Storage RLS policy on the registration-documents bucket and the RPC's
 * `auth.uid() is null` guard.
 *
 * GoTrue's email-enumeration protection makes signUp() succeed silently for
 * an already-registered email (no session, no new user), so we check the
 * email_already_registered RPC first to give a clear error instead of letting
 * the wizard advance and fail later with a confusing "session expired".
 */
export async function signUpForRegistration(
  values: RegistrationAccountInput,
  role: 'hospital',
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

export async function submitHospitalRegistration(
  values: HospitalRegistrationInput,
): Promise<Result<{ redirectTo: string }>> {
  const parsed = hospitalRegistrationSchema.safeParse(values)
  if (!parsed.success) return validationError()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return { data: null, error: 'Your session expired — please sign up again.' }

  const verifiedCertificates = await verifyUploadedFiles(supabase, parsed.data.certificates)
  if (!verifiedCertificates.ok) return { data: null, error: verifiedCertificates.error }

  const { error } = await supabase.rpc('register_hospital', {
    p_name: parsed.data.name,
    p_registration_type: parsed.data.registrationType,
    p_registration_number: parsed.data.registrationNumber,
    p_abn_number: parsed.data.abnNumber,
    p_city: parsed.data.city,
    p_country: parsed.data.country,
    p_address: parsed.data.address,
    p_zip_code: parsed.data.zipCode,
    p_phone: parsed.data.phone,
    p_contact_email: user.email,
    p_specialties: parsed.data.specialties,
    p_bed_count: parsed.data.bedCount,
    p_room_types: parsed.data.roomTypes,
    p_license_number: parsed.data.licenseNumber,
    p_accreditation_body: parsed.data.accreditationBody,
    p_certificates: verifiedCertificates.files,
  })

  if (error) {
    logger.error({ err: error, userId: user.id }, 'submitHospitalRegistration register_hospital RPC failed')
    return { data: null, error: GENERIC_AUTH_ERROR }
  }

  const { error: updateUserError } = await supabase.auth.updateUser({
    data: { full_name: parsed.data.name },
  })
  if (updateUserError) {
    logger.error(
      { err: updateUserError, userId: user.id },
      'submitHospitalRegistration failed to sync full_name to auth user metadata',
    )
  }

  await logAuditEvent({
    app: AUDIT_APP,
    action: 'registration.hospital_submitted',
    entityType: 'user',
    entityId: user.id,
  })

  return { data: { redirectTo: await postAuthRedirect(user.id) }, error: null }
}

export async function resubmitHospitalRegistration(
  hospitalId: string,
  values: HospitalRegistrationInput,
): Promise<Result<{ success: true }>> {
  const parsed = hospitalRegistrationSchema.safeParse(values)
  if (!parsed.success) return validationError()

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user?.email) return { data: null, error: 'Your session expired — please sign in again.' }

  const verifiedCertificates = await verifyUploadedFiles(supabase, parsed.data.certificates)
  if (!verifiedCertificates.ok) return { data: null, error: verifiedCertificates.error }

  const { error } = await supabase.rpc('resubmit_hospital_registration', {
    p_hospital_id: hospitalId,
    p_name: parsed.data.name,
    p_registration_type: parsed.data.registrationType,
    p_registration_number: parsed.data.registrationNumber,
    p_abn_number: parsed.data.abnNumber,
    p_city: parsed.data.city,
    p_country: parsed.data.country,
    p_address: parsed.data.address,
    p_zip_code: parsed.data.zipCode,
    p_phone: parsed.data.phone,
    p_contact_email: user.email,
    p_specialties: parsed.data.specialties,
    p_bed_count: parsed.data.bedCount,
    p_room_types: parsed.data.roomTypes,
    p_license_number: parsed.data.licenseNumber,
    p_accreditation_body: parsed.data.accreditationBody,
    p_certificates: verifiedCertificates.files,
  })

  if (error) {
    logger.error({ err: error, hospitalId }, 'resubmitHospitalRegistration RPC failed')
    return { data: null, error: GENERIC_AUTH_ERROR }
  }

  const { error: updateUserError } = await supabase.auth.updateUser({
    data: { full_name: parsed.data.name },
  })
  if (updateUserError) {
    logger.error(
      { err: updateUserError, hospitalId },
      'resubmitHospitalRegistration failed to sync full_name to auth user metadata',
    )
  }

  await logAuditEvent({
    app: AUDIT_APP,
    action: 'registration.resubmitted',
    entityType: 'hospital',
    entityId: hospitalId,
  })

  return { data: { success: true }, error: null }
}
