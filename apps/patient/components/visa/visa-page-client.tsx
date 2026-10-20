'use client'

import { useEffect, useMemo, useRef, useState, type ChangeEvent } from 'react'
import { useForm, useWatch, type Control } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import {
  AlertCircle, Check, CheckCircle2, FileDown, Info, Loader2, Upload,
} from 'lucide-react'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import type { VisaSubmissionRow, VisaDocumentRow } from '@iha/db/visa'
import type { Patient } from '@iha/db/types'
import { submitVisaForm } from '@/lib/actions/visa'
import { loadDraft, saveDraft, clearDraft } from '@/lib/draft-storage'
import { isValidPassportPhotoAspectRatio } from '@/lib/image-dimensions'
import { createClient } from '@iha/db/client'
import { PhoneInput } from '@/components/phone-input'
import { getVisaFormSchema, type VisaFormInput } from '@iha/validations'
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  cn,
} from '@iha/ui'

// ─── Step keys ────────────────────────────────────────────────────────────────

const STEP_KEYS = [
  'traveler_details',
  'medical_information',
  'provider_details',
  'financial_details',
  'travel_details',
  'visa_documents',
  'legal_compliance',
  'companion_details',
] as const

// ─── Per-step fields to trigger on Next ──────────────────────────────────────

const STEP_FIELDS: Partial<Record<number, (keyof VisaFormInput)[]>> = {
  0: ['first_name', 'last_name', 'gender', 'nationality', 'date_of_birth', 'passport_number', 'passport_expiry', 'email', 'phone'],
  1: ['has_medical_conditions', 'health_examination_completed'],
  2: ['provider_name', 'provider_organization', 'provider_address', 'provider_contact'],
  3: ['source_of_funds'],
  4: ['arrival_date', 'departure_date'],
  6: ['criminal_record', 'previous_visa_issues'],
}

// ─── Document category keys ───────────────────────────────────────────────────

// hospital_invitation / appointment_confirmation are generated and sent by
// the hospital directly (see the hospital-generated visa letters feature) —
// no longer collected here. They still surface, once sent, in the Visa &
// Travel section of the case detail page and in the document list below.
const VISA_DOC_KEYS   = ['passport', 'passport_photograph'] as const
const FINANCIAL_DOC_KEYS = ['bank_statement', 'sponsorship_letter', 'employer_letter'] as const
const COMPANION_DOC_KEYS = ['companion_passport', 'companion_proof_of_relationship'] as const
const ALL_DOC_KEYS = [...VISA_DOC_KEYS, ...FINANCIAL_DOC_KEYS, ...COMPANION_DOC_KEYS] as const

type DocKey = typeof ALL_DOC_KEYS[number]

// ─── Status config ────────────────────────────────────────────────────────────

const STATUS_BADGE_CLASS: Record<string, string> = {
  documents_submitted:       'bg-blue-100 text-blue-700',
  under_review:              'bg-blue-100 text-blue-700',
  additional_docs_requested: 'bg-orange-100 text-orange-700',
  application_submitted:     'bg-purple-100 text-purple-700',
  processing:                'bg-purple-100 text-purple-700',
  approved:                  'bg-emerald-100 text-emerald-700',
  rejected:                  'bg-red-100 text-red-700',
}

const STATUS_BANNER_TYPE: Record<string, 'info' | 'warning' | 'success' | 'error'> = {
  documents_submitted:       'info',
  under_review:              'info',
  additional_docs_requested: 'warning',
  application_submitted:     'info',
  processing:                'info',
  approved:                  'success',
  rejected:                  'error',
}

const BANNER_STYLES = {
  info:    'border-blue-200 bg-blue-50 text-blue-800',
  warning: 'border-amber-200 bg-amber-50 text-amber-800',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-800',
  error:   'border-red-200 bg-red-50 text-red-800',
}

const LOCKED_STATUSES = [
  'documents_submitted', 'under_review', 'additional_docs_requested',
  'application_submitted', 'processing', 'approved', 'rejected',
]

// ─── Types ────────────────────────────────────────────────────────────────────

type UploadedDoc = { id: string; fileName: string; fileSize: number; filePath: string; mimeType: string }

type Props = {
  caseId: string
  patientId: string
  userId: string
  referenceNumber: string
  initialSubmission: VisaSubmissionRow | null
  initialDocuments: VisaDocumentRow[]
  patient: Patient | null
  userEmail: string
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function formatBytes(b: number) {
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(0)} KB`
  return `${(b / (1024 * 1024)).toFixed(1)} MB`
}

function sanitizeName(name: string) {
  return name.replace(/[^a-zA-Z0-9._-]/g, '_')
}

// Patient profile stores one combined name; the visa form wants first/last
// separately, so the last word is treated as the surname.
function splitFullName(fullName: string) {
  const trimmed = fullName.trim()
  if (!trimmed) return { firstName: '', lastName: '' }
  const lastSpace = trimmed.lastIndexOf(' ')
  if (lastSpace === -1) return { firstName: trimmed, lastName: '' }
  return { firstName: trimmed.slice(0, lastSpace).trim(), lastName: trimmed.slice(lastSpace + 1).trim() }
}

const GENDER_TO_VISA_OPTION: Record<string, string> = {
  male: 'Male',
  female: 'Female',
  other: 'Other',
  prefer_not_to_say: 'Prefer not to say',
}

// Prefers a previously saved/submitted value over the patient-profile fallback.
function pick(saved: string | undefined, fallback: string) {
  return saved && saved.trim() ? saved : fallback
}

// ─── Shared input styles ──────────────────────────────────────────────────────

const inputClass =
  'w-full rounded-md border border-slate-200 px-3 py-2 text-sm text-slate-800 placeholder:text-slate-400 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:bg-slate-50 disabled:text-slate-400'

const selectClass =
  'w-full rounded-md border border-slate-200 bg-white px-3 py-2 text-sm text-slate-800 focus:border-cyan-500 focus:outline-none focus:ring-1 focus:ring-cyan-500 disabled:bg-slate-50 disabled:text-slate-400'

// Native date inputs render their "mm/dd/yyyy" hint using the field's text color rather than
// ::placeholder, so it has to be lightened manually to match the other inputs' placeholder color.
function dateInputClass(hasValue: boolean) {
  return cn(inputClass, !hasValue && 'text-slate-400')
}

// ─── Yes/No radio field ───────────────────────────────────────────────────────

function YesNoField({
  control,
  name,
  label,
  disabled,
}: {
  control: Control<VisaFormInput>
  name: keyof VisaFormInput
  label: string
  disabled: boolean
}) {
  const t = useTranslations('visaForm')

  return (
    <FormField
      control={control}
      name={name}
      render={({ field }) => (
        <FormItem>
          <div className="flex items-center justify-between gap-4 py-1">
            <FormLabel className="font-normal text-slate-700">{label}</FormLabel>
            <div className="flex shrink-0 items-center gap-4">
              {(['Yes', 'No'] as const).map((opt) => (
                <label key={opt} className="flex cursor-pointer items-center gap-1.5 text-sm text-slate-600">
                  <input
                    type="radio"
                    value={opt}
                    checked={field.value === opt}
                    onChange={() => field.onChange(opt)}
                    disabled={disabled}
                    className="h-4 w-4 border-slate-300 text-cyan-600 focus:ring-cyan-500 disabled:opacity-50"
                  />
                  {opt === 'Yes' ? t('yes') : t('no')}
                </label>
              ))}
            </div>
          </div>
          <FormMessage />
        </FormItem>
      )}
    />
  )
}

// ─── Document upload zone ─────────────────────────────────────────────────────

function DocumentUploadZone({
  categoryKey, label, required, uploaded, onUpload, disabled,
}: {
  categoryKey: string
  label: string
  required: boolean
  uploaded: UploadedDoc | null
  onUpload: (file: File) => Promise<void>
  disabled: boolean
}) {
  const t = useTranslations('visaForm')
  const [uploading, setUploading] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  async function handleChange(e: ChangeEvent<HTMLInputElement>) {
    const file = e.target.files?.[0]
    if (!file) return

    if (categoryKey === 'passport_photograph' && file.type.startsWith('image/')) {
      const validRatio = await isValidPassportPhotoAspectRatio(file).catch(() => false)
      if (!validRatio) {
        toast.error(t('errors.invalidPhotoDimensions'))
        if (inputRef.current) inputRef.current.value = ''
        return
      }
    }

    setUploading(true)
    await onUpload(file)
    setUploading(false)
    if (inputRef.current) inputRef.current.value = ''
  }

  return (
    <div className="flex items-center justify-between gap-4 rounded-lg border border-slate-200 bg-slate-50 p-4">
      <div className="flex min-w-0 items-center gap-3">
        <div className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-full ${uploaded ? 'bg-emerald-100' : 'bg-white border border-slate-200'}`}>
          {uploaded
            ? <Check className="h-4 w-4 text-emerald-600" />
            : <Upload className="h-4 w-4 text-slate-400" />}
        </div>
        <div className="min-w-0">
          <p className="text-sm font-medium text-slate-800">
            {label}
            {required && <span className="ml-1 text-red-500">*</span>}
          </p>
          {uploaded
            ? <p className="truncate text-xs text-slate-500">{uploaded.fileName} · {formatBytes(uploaded.fileSize)}</p>
            : <p className="text-xs text-slate-400">{t('noFileUploaded')}</p>}
        </div>
      </div>
      {!disabled && (
        <>
          <input
            ref={inputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png"
            onChange={handleChange}
            className="hidden"
            disabled={uploading}
            aria-label={`Upload ${label}`}
          />
          <button
            type="button"
            onClick={() => inputRef.current?.click()}
            disabled={uploading}
            className="inline-flex shrink-0 items-center gap-1.5 rounded-md border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            {uploading
              ? <Loader2 className="h-3.5 w-3.5 animate-spin" />
              : <Upload className="h-3.5 w-3.5" />}
            {uploaded ? t('replaceFile') : t('uploadFile')}
          </button>
        </>
      )}
    </div>
  )
}

// ─── Financial step ───────────────────────────────────────────────────────────

function FinancialStep({
  control, uploadedDocs, onUpload, disabled,
}: {
  control: Control<VisaFormInput>
  uploadedDocs: Record<string, UploadedDoc | null>
  onUpload: (category: string, file: File) => Promise<void>
  disabled: boolean
}) {
  const t = useTranslations('visaForm')
  const funds = useWatch({ control, name: 'source_of_funds' }) ?? ''
  const isSelfFunded = funds === 'Self-Funded'
  const isEmployer   = funds === 'Employer Sponsored'
  const isFamily     = funds === 'Family Sponsored'
  const isSponsored  = isEmployer || isFamily
  const isOther      = funds === 'Other'

  return (
    <div className="space-y-5">
      <div className="grid gap-4 sm:grid-cols-2">
        <FormField
          control={control}
          name="source_of_funds"
          render={({ field }) => (
            <FormItem>
              <FormLabel>{t('fields.sourceOfFunds')} <span className="text-red-500">*</span></FormLabel>
              <Select onValueChange={field.onChange} value={field.value} disabled={disabled}>
                <FormControl>
                  <SelectTrigger className={cn(selectClass, !field.value && 'text-slate-400')}>
                    <SelectValue placeholder={t('fields.sourceOfFundsPlaceholder')} />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  <SelectItem value="Self-Funded">{t('fields.selfFunded')}</SelectItem>
                  <SelectItem value="Employer Sponsored">{t('fields.employerSponsored')}</SelectItem>
                  <SelectItem value="Family Sponsored">{t('fields.familySponsored')}</SelectItem>
                  <SelectItem value="Other">{t('fields.other')}</SelectItem>
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        {isSelfFunded && (
          <FormField
            control={control}
            name="bank_balance"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('fields.bankBalance')} <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <input
                    type="text"
                    {...field}
                    disabled={disabled}
                    placeholder={t('fields.bankBalancePlaceholder')}
                    className={inputClass}
                  />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
      </div>

      {isSponsored && (
        <div className="grid gap-4 sm:grid-cols-2">
          <FormField
            control={control}
            name="sponsor_name"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('fields.sponsorName')} <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <input type="text" {...field} disabled={disabled} placeholder={t('fields.sponsorNamePlaceholder')} className={inputClass} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="sponsor_relationship"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('fields.relationship')} <span className="text-red-500">*</span></FormLabel>
                <FormControl>
                  <input type="text" {...field} disabled={disabled} placeholder={t('fields.relationshipPlaceholder')} className={inputClass} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={control}
            name="sponsor_contact"
            render={({ field }) => (
              <FormItem>
                <FormLabel>{t('fields.contactNumber')} <span className="text-red-500">*</span></FormLabel>
                <PhoneInput
                  value={field.value ?? ''}
                  onChange={field.onChange}
                  onBlur={field.onBlur}
                  disabled={disabled}
                  placeholder={t('fields.phonePlaceholder')}
                />
                <FormMessage />
              </FormItem>
            )}
          />
        </div>
      )}

      {funds !== '' && (
        <div className="space-y-2">
          <p className="text-sm font-medium text-slate-700">
            {t('fields.supportingDocuments')} <span className="text-red-500">*</span>
          </p>
          <p className="text-xs text-slate-400">
            {isSelfFunded
              ? t('fundingHints.selfFunded')
              : isEmployer
              ? t('fundingHints.employer')
              : isFamily
              ? t('fundingHints.family')
              : t('fundingHints.other')}
          </p>
          <div className="space-y-2">
            {(isSelfFunded || isOther) && (
              <DocumentUploadZone
                categoryKey="bank_statement"
                label={t('docCategories.bank_statement')}
                required={isSelfFunded}
                uploaded={uploadedDocs.bank_statement ?? null}
                onUpload={(file) => onUpload('bank_statement', file)}
                disabled={disabled}
              />
            )}
            {(isSponsored || isOther) && (
              <DocumentUploadZone
                categoryKey="sponsorship_letter"
                label={t('docCategories.sponsorship_letter')}
                required={isFamily}
                uploaded={uploadedDocs.sponsorship_letter ?? null}
                onUpload={(file) => onUpload('sponsorship_letter', file)}
                disabled={disabled}
              />
            )}
            {(isEmployer || isOther) && (
              <DocumentUploadZone
                categoryKey="employer_letter"
                label={t('docCategories.employer_letter')}
                required={false}
                uploaded={uploadedDocs.employer_letter ?? null}
                onUpload={(file) => onUpload('employer_letter', file)}
                disabled={disabled}
              />
            )}
          </div>
        </div>
      )}
    </div>
  )
}

// ─── Companion step ───────────────────────────────────────────────────────────

function CompanionStep({
  control, uploadedDocs, onUpload, disabled,
}: {
  control: Control<VisaFormInput>
  uploadedDocs: Record<string, UploadedDoc | null>
  onUpload: (category: string, file: File) => Promise<void>
  disabled: boolean
}) {
  const t = useTranslations('visaForm')
  const hasCompanion = useWatch({ control, name: 'travelling_with_companion' }) === 'Yes'

  return (
    <div className="space-y-5">
      <YesNoField
        control={control}
        name="travelling_with_companion"
        label={t('fields.companionQuestion')}
        disabled={disabled}
      />

      {hasCompanion && (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <FormField
              control={control}
              name="companion_name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fields.companionName')} <span className="text-red-500">*</span></FormLabel>
                  <FormControl>
                    <input type="text" {...field} disabled={disabled} placeholder={t('fields.companionNamePlaceholder')} className={inputClass} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="companion_relationship"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fields.relationship')} <span className="text-red-500">*</span></FormLabel>
                  <FormControl>
                    <input type="text" {...field} disabled={disabled} placeholder={t('fields.relationshipPlaceholder')} className={inputClass} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="companion_passport_number"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fields.companionPassportNumber')} <span className="text-red-500">*</span></FormLabel>
                  <FormControl>
                    <input type="text" {...field} disabled={disabled} placeholder={t('fields.companionPassportNumberPlaceholder')} className={inputClass} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
            <FormField
              control={control}
              name="companion_passport_expiry"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>{t('fields.companionPassportExpiry')} <span className="text-red-500">*</span></FormLabel>
                  <FormControl>
                    <input type="date" {...field} disabled={disabled} onClick={(e) => e.currentTarget.showPicker?.()} className={dateInputClass(!!field.value)} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />
          </div>
          <div className="space-y-2">
            <DocumentUploadZone
              categoryKey="companion_passport"
              label={t('docCategories.companion_passport')}
              required={false}
              uploaded={uploadedDocs.companion_passport ?? null}
              onUpload={(file) => onUpload('companion_passport', file)}
              disabled={disabled}
            />
            <DocumentUploadZone
              categoryKey="companion_proof_of_relationship"
              label={t('docCategories.companion_proof_of_relationship')}
              required={false}
              uploaded={uploadedDocs.companion_proof_of_relationship ?? null}
              onUpload={(file) => onUpload('companion_proof_of_relationship', file)}
              disabled={disabled}
            />
          </div>
        </>
      )}
    </div>
  )
}

// ─── Main component ───────────────────────────────────────────────────────────

export function VisaPageClient({
  caseId, userId, initialSubmission, initialDocuments, patient, userEmail,
}: Props) {
  const t = useTranslations('visaForm')

  const visaFormSchema = useMemo(() => getVisaFormSchema({
    firstNameRequired: t('validation.firstNameRequired'),
    lastNameRequired: t('validation.lastNameRequired'),
    genderRequired: t('validation.genderRequired'),
    nationalityRequired: t('validation.nationalityRequired'),
    dateOfBirthRequired: t('validation.dateOfBirthRequired'),
    dateOfBirthInvalid: t('validation.dateOfBirthInvalid'),
    passportNumberRequired: t('validation.passportNumberRequired'),
    passportNumberInvalid: t('validation.passportNumberInvalid'),
    passportExpiryRequired: t('validation.passportExpiryRequired'),
    passportExpiryFuture: t('validation.passportExpiryFuture'),
    emailInvalid: t('validation.emailInvalid'),
    phoneInvalid: t('validation.phoneInvalid'),
    answerRequired: t('validation.answerRequired'),
    providerNameRequired: t('validation.providerNameRequired'),
    organizationRequired: t('validation.organizationRequired'),
    addressRequired: t('validation.addressRequired'),
    contactRequired: t('validation.contactRequired'),
    sourceOfFundsRequired: t('validation.sourceOfFundsRequired'),
    arrivalDateRequired: t('validation.arrivalDateRequired'),
    arrivalDateFuture: t('validation.arrivalDateFuture'),
    departureDateRequired: t('validation.departureDateRequired'),
    companionFieldRequired: t('errors.fieldRequired'),
  }), [t])

  const savedForm = (initialSubmission?.form_data ?? {}) as Partial<VisaFormInput>

  const profileDefaults = useMemo(() => {
    const { firstName, lastName } = splitFullName(patient?.full_name ?? '')
    return {
      first_name:  firstName,
      last_name:   lastName,
      gender:      patient?.gender ? (GENDER_TO_VISA_OPTION[patient.gender] ?? '') : '',
      nationality: patient?.nationality ?? '',
      date_of_birth: patient?.date_of_birth ?? '',
      phone:       patient?.phone ?? '',
      email:       userEmail,
    }
  }, [patient, userEmail])

  const form = useForm<VisaFormInput>({
    resolver: zodResolver(visaFormSchema),
    defaultValues: {
      first_name:                    pick(savedForm.first_name, profileDefaults.first_name),
      last_name:                     pick(savedForm.last_name, profileDefaults.last_name),
      gender:                        pick(savedForm.gender, profileDefaults.gender),
      nationality:                   pick(savedForm.nationality, profileDefaults.nationality),
      date_of_birth:                 pick(savedForm.date_of_birth, profileDefaults.date_of_birth),
      australian_provider_details:   savedForm.australian_provider_details ?? '',
      passport_number:               savedForm.passport_number ?? '',
      passport_expiry:               savedForm.passport_expiry ?? '',
      email:                         pick(savedForm.email, profileDefaults.email),
      phone:                         pick(savedForm.phone, profileDefaults.phone),
      condition_summary:             savedForm.condition_summary ?? '',
      has_medical_conditions:        savedForm.has_medical_conditions ?? '',
      medical_conditions_details:    savedForm.medical_conditions_details ?? '',
      health_examination_completed:  savedForm.health_examination_completed ?? '',
      provider_name:                 savedForm.provider_name ?? '',
      provider_organization:         savedForm.provider_organization ?? '',
      provider_address:              savedForm.provider_address ?? '',
      provider_contact:              savedForm.provider_contact ?? '',
      source_of_funds:               savedForm.source_of_funds ?? '',
      bank_balance:                  savedForm.bank_balance ?? '',
      sponsor_name:                  savedForm.sponsor_name ?? '',
      sponsor_relationship:          savedForm.sponsor_relationship ?? '',
      sponsor_contact:               savedForm.sponsor_contact ?? '',
      arrival_date:                  savedForm.arrival_date ?? '',
      departure_date:                savedForm.departure_date ?? '',
      purpose_of_visit:              savedForm.purpose_of_visit ?? '',
      flight_booking:                savedForm.flight_booking ?? '',
      accommodation:                 savedForm.accommodation ?? '',
      criminal_record:               savedForm.criminal_record ?? '',
      criminal_record_details:       savedForm.criminal_record_details ?? '',
      previous_visa_issues:          savedForm.previous_visa_issues ?? '',
      previous_visa_issues_details:  savedForm.previous_visa_issues_details ?? '',
      travelling_with_companion:     savedForm.travelling_with_companion ?? '',
      companion_name:                savedForm.companion_name ?? '',
      companion_relationship:        savedForm.companion_relationship ?? '',
      companion_passport_number:     savedForm.companion_passport_number ?? '',
      companion_passport_expiry:     savedForm.companion_passport_expiry ?? '',
    },
  })

  useEffect(() => {
    const erroredFields = Object.keys(form.formState.errors) as Array<keyof VisaFormInput>
    if (erroredFields.length > 0) {
      void form.trigger(erroredFields)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [visaFormSchema])

  const [currentStep, setCurrentStep] = useState(0)
  const [submitting, setSubmitting]   = useState(false)
  const [stepError, setStepError]     = useState<string | null>(null)
  const [submitted, setSubmitted]     = useState(LOCKED_STATUSES.includes(initialSubmission?.status ?? ''))

  const [uploadedDocs, setUploadedDocs] = useState<Record<string, UploadedDoc | null>>(() => {
    const initial: Record<string, UploadedDoc | null> = Object.fromEntries(
      ALL_DOC_KEYS.map((key) => [key, null]),
    )
    for (const doc of initialDocuments) {
      if (doc.category in initial) {
        initial[doc.category] = {
          id:       doc.id,
          fileName: doc.file_name,
          fileSize: doc.file_size_bytes ?? 0,
          filePath: doc.file_path,
          mimeType: doc.mime_type ?? '',
        }
      }
    }
    return initial
  })

  const watchedHasMedical = form.watch('has_medical_conditions')
  const watchedCriminal   = form.watch('criminal_record')
  const watchedVisaIssues = form.watch('previous_visa_issues')

  const status    = initialSubmission?.status ?? null
  const badgeClass = status ? (STATUS_BADGE_CLASS[status] ?? null) : null
  const bannerType = status ? (STATUS_BANNER_TYPE[status] ?? null) : null
  const isLocked  = submitted || LOCKED_STATUSES.includes(status ?? '')

  const totalSteps = STEP_KEYS.length
  const isLastStep = currentStep === totalSteps - 1

  const draftName = `visa-form:${caseId}`

  // Gates the save-effect below until the restore below has actually applied
  // (or found nothing to apply). Without this, the save-effect's first run
  // fires with pre-restore closure values and immediately overwrites the
  // just-loaded draft in storage before the restored state has landed —
  // permanently clobbering it, most visibly for uploadedDocs (React Strict
  // Mode's double-invoke makes this deterministic in dev, not just a rare race).
  const [hydrated, setHydrated] = useState(false)

  useEffect(() => {
    if (isLocked) {
      clearDraft(draftName)
      setHydrated(true)
      return
    }
    const saved = loadDraft<{ currentStep?: number; values?: VisaFormInput; uploadedDocs?: Record<string, UploadedDoc | null> }>(draftName)
    if (saved) {
      if (typeof saved.currentStep === 'number') setCurrentStep(saved.currentStep)
      if (saved.values) form.reset(saved.values)
      if (saved.uploadedDocs) setUploadedDocs(saved.uploadedDocs)
    }
    setHydrated(true)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  useEffect(() => {
    if (isLocked || !hydrated) return

    saveDraft(draftName, {
      currentStep,
      values: form.getValues(),
      uploadedDocs,
    })

    const subscription = form.watch((values) => {
      saveDraft(draftName, { currentStep, values, uploadedDocs })
    })

    return () => subscription.unsubscribe()
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentStep, isLocked, uploadedDocs, hydrated])

  async function handleDocumentUpload(category: string, file: File) {
    const supabase = createClient()
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { toast.error(t('errors.notAuthenticated')); return }

    const path = `${userId}/${caseId}/${category}/${Date.now()}_${sanitizeName(file.name)}`
    const { error: uploadError } = await supabase.storage
      .from('visa-documents')
      .upload(path, file, { upsert: true })
    if (uploadError) { toast.error(t('errors.uploadFailed')); return }

    setUploadedDocs((prev) => ({
      ...prev,
      [category]: { id: '', fileName: file.name, fileSize: file.size, filePath: path, mimeType: file.type },
    }))
    if (stepError) setStepError(null)
    toast.success(t('toasts.fileUploaded', { name: file.name }))
  }

  function handleBack() {
    setStepError(null)
    form.clearErrors()
    setCurrentStep((s) => Math.max(s - 1, 0))
  }

  async function handleNext() {
    setStepError(null)
    let valid = true

    if (currentStep === 0) {
      valid = await form.trigger(STEP_FIELDS[0]!)
    } else if (currentStep === 1) {
      valid = await form.trigger(STEP_FIELDS[1]!)
      if (valid && watchedHasMedical === 'Yes' && !form.getValues('medical_conditions_details')?.trim()) {
        form.setError('medical_conditions_details', { message: t('errors.medicalConditionsRequired') })
        valid = false
      }
    } else if (currentStep === 2) {
      valid = await form.trigger(STEP_FIELDS[2]!)
    } else if (currentStep === 3) {
      valid = await form.trigger(STEP_FIELDS[3]!)
      if (valid) {
        const funds = form.getValues('source_of_funds')
        if (funds === 'Self-Funded') {
          if (!form.getValues('bank_balance')?.trim()) {
            form.setError('bank_balance', { message: t('errors.bankBalanceRequired') })
            valid = false
          } else if (!uploadedDocs.bank_statement) {
            setStepError(t('errors.bankStatementRequired'))
            return
          }
        } else if (funds === 'Employer Sponsored' || funds === 'Family Sponsored') {
          for (const f of ['sponsor_name', 'sponsor_relationship', 'sponsor_contact'] as const) {
            if (!form.getValues(f)?.trim()) {
              form.setError(f, { message: t('errors.fieldRequired') })
              valid = false
            }
          }
          if (valid) {
            if (funds === 'Family Sponsored' && !uploadedDocs.sponsorship_letter) {
              setStepError(t('errors.sponsorshipLetterRequired'))
              return
            } else if (funds === 'Employer Sponsored' && !uploadedDocs.sponsorship_letter && !uploadedDocs.employer_letter) {
              setStepError(t('errors.oneDocRequired'))
              return
            }
          }
        } else if (funds === 'Other') {
          const hasAnyDoc = uploadedDocs.bank_statement || uploadedDocs.sponsorship_letter || uploadedDocs.employer_letter
          if (!hasAnyDoc) {
            setStepError(t('errors.financialDocRequired'))
            return
          }
        }
      }
    } else if (currentStep === 4) {
      valid = await form.trigger(STEP_FIELDS[4]!)
      if (valid) {
        const arrival   = form.getValues('arrival_date')
        const departure = form.getValues('departure_date')
        if (arrival && departure) {
          const a = new Date(arrival)
          const d = new Date(departure)
          if (!isNaN(a.getTime()) && !isNaN(d.getTime()) && d <= a) {
            form.setError('departure_date', { message: t('errors.departureMustBeAfter') })
            valid = false
          }
        }
      }
    } else if (currentStep === 5) {
      if (!uploadedDocs.passport)                 { setStepError(t('errors.passportRequired')); return }
      if (!uploadedDocs.passport_photograph)      { setStepError(t('errors.passportPhotoRequired')); return }
    } else if (currentStep === 6) {
      valid = await form.trigger(STEP_FIELDS[6]!)
      if (valid) {
        if (watchedCriminal === 'Yes' && !form.getValues('criminal_record_details')?.trim()) {
          form.setError('criminal_record_details', { message: t('errors.criminalRecordDetailsRequired') })
          valid = false
        }
        if (watchedVisaIssues === 'Yes' && !form.getValues('previous_visa_issues_details')?.trim()) {
          form.setError('previous_visa_issues_details', { message: t('errors.visaIssuesDetailsRequired') })
          valid = false
        }
      }
    }

    if (!valid) return
    setCurrentStep((s) => Math.min(s + 1, totalSteps - 1))
  }

  async function handleSubmit() {
    setStepError(null)

    if (form.getValues('travelling_with_companion') === 'Yes') {
      const valid = await form.trigger([
        'companion_name',
        'companion_relationship',
        'companion_passport_number',
        'companion_passport_expiry',
      ])
      if (!valid) return
    }

    setSubmitting(true)
    form.clearErrors('root')

    const pendingDocuments = ALL_DOC_KEYS
      .filter((key) => uploadedDocs[key]?.id === '')
      .map((key) => {
        const doc = uploadedDocs[key]!
        return {
          category:      key,
          fileName:      doc.fileName,
          filePath:      doc.filePath,
          fileSizeBytes: doc.fileSize,
          mimeType:      doc.mimeType,
        }
      })

    const { error: submitError } = await submitVisaForm(caseId, form.getValues(), pendingDocuments)
    if (submitError) {
      form.setError('root', { message: t('errors.submitFailed') })
      setSubmitting(false)
      return
    }
    clearDraft(draftName)
    setSubmitted(true)
    toast.success(t('toasts.appSubmitted'))
    setSubmitting(false)
  }

  const currentStepKey = STEP_KEYS[currentStep]!

  return (
    <div className="space-y-5">
      {/* Status badge */}
      {badgeClass && status && (
        <div className="flex flex-wrap items-center gap-2">
          <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${badgeClass}`}>
            {t(`statusBadge.${status}` as never)}
          </span>
        </div>
      )}

      {/* Status banner (info-type omitted: it always coincides with the
          "Application Submitted" card below and would just repeat it) */}
      {bannerType && bannerType !== 'info' && status && (
        <div className={`flex items-start gap-2.5 rounded-lg border px-4 py-3 text-sm ${BANNER_STYLES[bannerType]}`}>
          <Info className="mt-0.5 h-4 w-4 shrink-0" />
          {t(`statusBanner.${status}` as never)}
        </div>
      )}

      {/* Approved visa download */}
      {status === 'approved' && (
        <div className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-emerald-300 bg-emerald-50 px-5 py-4">
          <div className="flex items-center gap-3">
            <div className="grid h-10 w-10 shrink-0 place-items-center rounded-full bg-emerald-100">
              <CheckCircle2 className="h-5 w-5 text-emerald-600" />
            </div>
            <div>
              <p className="font-semibold text-emerald-900">{t('approvedTitle')}</p>
              <p className="text-sm text-emerald-700">{t('approvedBody')}</p>
            </div>
          </div>
          <button className="inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-medium text-white hover:bg-emerald-700">
            <FileDown className="h-4 w-4" />
            {t('downloadVisa')}
          </button>
        </div>
      )}

      {/* Step progress bar */}
      <div className="rounded-xl border border-slate-200 bg-white px-5 py-4">
        <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
          <div
            className="h-full rounded-full bg-cyan-700 transition-all"
            style={{ width: `${((currentStep + (submitted ? 1 : 0.5)) / totalSteps) * 100}%` }}
          />
        </div>
        <p className="mt-2 text-xs text-slate-600">
          {t('stepOf', { step: currentStep + 1, total: totalSteps })} ·{' '}
          <span className="font-semibold text-cyan-700">{t(`steps.${currentStepKey}`)}</span>
        </p>
      </div>

      {/* Step content */}
      <Form {...form}>
        <form onSubmit={(e) => e.preventDefault()}>
          {!submitted ? (
            <div className="rounded-xl border border-slate-200 bg-white p-6">
              <h2 className="mb-5 text-lg font-semibold text-slate-900">{t(`steps.${currentStepKey}`)}</h2>

              {/* Step 0: Traveler Details */}
              {currentStep === 0 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="first_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.firstName')}</FormLabel>
                        <FormControl>
                          <input type="text" {...field} disabled={isLocked} placeholder={t('fields.firstNamePlaceholder')} className={inputClass} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="last_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.lastName')}</FormLabel>
                        <FormControl>
                          <input type="text" {...field} disabled={isLocked} placeholder={t('fields.lastNamePlaceholder')} className={inputClass} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="gender"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.gender')}</FormLabel>
                        <Select onValueChange={field.onChange} value={field.value} disabled={isLocked}>
                          <FormControl>
                            <SelectTrigger className={cn(selectClass, !field.value && 'text-slate-400')}>
                              <SelectValue placeholder={t('fields.genderPlaceholder')} />
                            </SelectTrigger>
                          </FormControl>
                          <SelectContent>
                            <SelectItem value="Male">{t('genderOptions.male')}</SelectItem>
                            <SelectItem value="Female">{t('genderOptions.female')}</SelectItem>
                            <SelectItem value="Other">{t('genderOptions.other')}</SelectItem>
                            <SelectItem value="Prefer not to say">{t('genderOptions.preferNotToSay')}</SelectItem>
                          </SelectContent>
                        </Select>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="nationality"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.nationality')}</FormLabel>
                        <FormControl>
                          <input type="text" {...field} disabled={isLocked} placeholder={t('fields.nationalityPlaceholder')} className={inputClass} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="date_of_birth"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.dateOfBirth')}</FormLabel>
                        <FormControl>
                          <input type="date" {...field} disabled={isLocked} onClick={(e) => e.currentTarget.showPicker?.()} className={dateInputClass(!!field.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="australian_provider_details"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.australianProviderDetails')}</FormLabel>
                        <FormControl>
                          <input type="text" {...field} disabled={isLocked} placeholder={t('fields.australianProviderDetailsPlaceholder')} className={inputClass} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="passport_number"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.passportNumber')}</FormLabel>
                        <FormControl>
                          <input type="text" {...field} disabled={isLocked} placeholder={t('fields.passportNumberPlaceholder')} className={inputClass} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="passport_expiry"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.passportExpiry')}</FormLabel>
                        <FormControl>
                          <input type="date" {...field} disabled={isLocked} onClick={(e) => e.currentTarget.showPicker?.()} className={dateInputClass(!!field.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="email"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.email')}</FormLabel>
                        <FormControl>
                          <input type="email" {...field} disabled={isLocked} placeholder={t('fields.emailPlaceholder')} className={inputClass} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="phone"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.phone')}</FormLabel>
                        <PhoneInput
                          value={field.value ?? ''}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          disabled={isLocked}
                          placeholder={t('fields.phonePlaceholder')}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Step 1: Medical Information */}
              {currentStep === 1 && (
                <div className="space-y-4">
                  <FormField
                    control={form.control}
                    name="condition_summary"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.conditionSummary')}</FormLabel>
                        <FormControl>
                          <textarea
                            {...field}
                            rows={4}
                            disabled={isLocked}
                            placeholder={t('fields.conditionSummaryPlaceholder')}
                            className={`${inputClass} resize-none`}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <YesNoField
                    control={form.control}
                    name="has_medical_conditions"
                    label={t('fields.hasMedicalConditions')}
                    disabled={isLocked}
                  />
                  {watchedHasMedical === 'Yes' && (
                    <FormField
                      control={form.control}
                      name="medical_conditions_details"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('fields.medicalConditionsDetails')}</FormLabel>
                          <FormControl>
                            <textarea
                              {...field}
                              rows={3}
                              disabled={isLocked}
                              placeholder={t('fields.medicalConditionsDetailsPlaceholder')}
                              className={`${inputClass} resize-none`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <YesNoField
                    control={form.control}
                    name="health_examination_completed"
                    label={t('fields.healthExamCompleted')}
                    disabled={isLocked}
                  />
                </div>
              )}

              {/* Step 2: Australian Provider Details */}
              {currentStep === 2 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="provider_name"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.providerName')}</FormLabel>
                        <FormControl>
                          <input type="text" {...field} disabled={isLocked} placeholder={t('fields.providerNamePlaceholder')} className={inputClass} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="provider_organization"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.organization')}</FormLabel>
                        <FormControl>
                          <input type="text" {...field} disabled={isLocked} placeholder={t('fields.organizationPlaceholder')} className={inputClass} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="provider_address"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.address')}</FormLabel>
                        <FormControl>
                          <input type="text" {...field} disabled={isLocked} placeholder={t('fields.addressPlaceholder')} className={inputClass} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="provider_contact"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.contact')}</FormLabel>
                        <PhoneInput
                          value={field.value ?? ''}
                          onChange={field.onChange}
                          onBlur={field.onBlur}
                          disabled={isLocked}
                          placeholder={t('fields.phonePlaceholder')}
                        />
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Step 3: Financial Details */}
              {currentStep === 3 && (
                <FinancialStep
                  control={form.control}
                  uploadedDocs={uploadedDocs}
                  onUpload={handleDocumentUpload}
                  disabled={isLocked}
                />
              )}

              {/* Step 4: Travel Details */}
              {currentStep === 4 && (
                <div className="grid gap-4 sm:grid-cols-2">
                  <FormField
                    control={form.control}
                    name="arrival_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.intendedArrival')}</FormLabel>
                        <FormControl>
                          <input type="date" {...field} disabled={isLocked} onClick={(e) => e.currentTarget.showPicker?.()} className={dateInputClass(!!field.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="departure_date"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.intendedDeparture')}</FormLabel>
                        <FormControl>
                          <input type="date" {...field} disabled={isLocked} onClick={(e) => e.currentTarget.showPicker?.()} className={dateInputClass(!!field.value)} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <div className="sm:col-span-2">
                    <FormField
                      control={form.control}
                      name="purpose_of_visit"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('fields.purposeOfVisit')}</FormLabel>
                          <FormControl>
                            <input type="text" {...field} disabled={isLocked} placeholder={t('fields.purposeOfVisitPlaceholder')} className={inputClass} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  </div>
                  <FormField
                    control={form.control}
                    name="flight_booking"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.flightBooking')}</FormLabel>
                        <FormControl>
                          <input type="text" {...field} disabled={isLocked} placeholder={t('fields.flightBookingPlaceholder')} className={inputClass} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                  <FormField
                    control={form.control}
                    name="accommodation"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>{t('fields.accommodation')}</FormLabel>
                        <FormControl>
                          <input type="text" {...field} disabled={isLocked} placeholder={t('fields.accommodationPlaceholder')} className={inputClass} />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              )}

              {/* Step 5: Visa Documents */}
              {currentStep === 5 && (
                <div className="space-y-3">
                  <p className="text-sm text-slate-500">{t('visaDocsNote')}</p>
                  <p className="rounded-lg bg-cyan-50 p-3 text-sm text-cyan-800">{t('hospitalDocsNote')}</p>
                  <div className="space-y-3">
                    {VISA_DOC_KEYS.map((key) => (
                      <DocumentUploadZone
                        key={key}
                        categoryKey={key}
                        label={t(`docCategories.${key}`)}
                        required={true}
                        uploaded={uploadedDocs[key] ?? null}
                        onUpload={(file) => handleDocumentUpload(key, file)}
                        disabled={isLocked}
                      />
                    ))}
                  </div>
                </div>
              )}

              {/* Step 6: Legal & Compliance */}
              {currentStep === 6 && (
                <div className="space-y-4">
                  <YesNoField
                    control={form.control}
                    name="criminal_record"
                    label={t('fields.criminalRecord')}
                    disabled={isLocked}
                  />
                  {watchedCriminal === 'Yes' && (
                    <FormField
                      control={form.control}
                      name="criminal_record_details"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('fields.provideDetails')}</FormLabel>
                          <FormControl>
                            <textarea
                              {...field}
                              rows={3}
                              disabled={isLocked}
                              placeholder={t('fields.provideDetailsPlaceholder')}
                              className={`${inputClass} resize-none`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                  <YesNoField
                    control={form.control}
                    name="previous_visa_issues"
                    label={t('fields.previousVisaIssues')}
                    disabled={isLocked}
                  />
                  {watchedVisaIssues === 'Yes' && (
                    <FormField
                      control={form.control}
                      name="previous_visa_issues_details"
                      render={({ field }) => (
                        <FormItem>
                          <FormLabel>{t('fields.provideDetails')}</FormLabel>
                          <FormControl>
                            <textarea
                              {...field}
                              rows={3}
                              disabled={isLocked}
                              placeholder={t('fields.provideDetailsPlaceholder')}
                              className={`${inputClass} resize-none`}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                  )}
                </div>
              )}

              {/* Step 7: Companion Details */}
              {currentStep === 7 && (
                <CompanionStep
                  control={form.control}
                  uploadedDocs={uploadedDocs}
                  onUpload={handleDocumentUpload}
                  disabled={isLocked}
                />
              )}

              {/* Step-level error */}
              {stepError && (
                <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {stepError}
                </div>
              )}

              {/* Root form error */}
              {form.formState.errors.root && (
                <div className="mt-5 flex items-start gap-2 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
                  <AlertCircle className="mt-0.5 h-4 w-4 shrink-0" />
                  {form.formState.errors.root.message}
                </div>
              )}
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center">
              <CheckCircle2 className="mx-auto mb-3 h-10 w-10 text-emerald-500" />
              <p className="font-semibold text-emerald-900">{t('submittedTitle')}</p>
              <p className="mt-1 text-sm text-emerald-700">{t('submittedBody')}</p>
            </div>
          )}
        </form>
      </Form>

      {/* Navigation */}
      {!submitted && (
        <div className="flex items-center justify-between">
          <button
            type="button"
            onClick={handleBack}
            disabled={currentStep === 0}
            className="rounded-lg border border-slate-200 px-5 py-2 text-sm font-medium text-slate-600 hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {t('back')}
          </button>

          {isLastStep ? (
            <button
              type="button"
              onClick={handleSubmit}
              disabled={submitting || isLocked}
              className="inline-flex items-center gap-2 rounded-lg bg-cyan-700 px-5 py-2 text-sm font-medium text-white hover:bg-cyan-800 disabled:opacity-60"
            >
              {submitting && <Loader2 className="h-4 w-4 animate-spin" />}
              {t('submitApplication')}
            </button>
          ) : (
            <button
              type="button"
              onClick={handleNext}
              disabled={isLocked}
              className="rounded-lg bg-cyan-700 px-5 py-2 text-sm font-medium text-white hover:bg-cyan-800 disabled:opacity-60"
            >
              {t('next')}
            </button>
          )}
        </div>
      )}
    </div>
  )
}
