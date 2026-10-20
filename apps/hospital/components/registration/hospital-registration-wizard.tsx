'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { SpecialtyOption } from '@iha/db/specialties'
import { signUpForRegistration, submitHospitalRegistration } from '@/lib/actions/registration'
import { loadDraft, saveDraft, clearDraft } from '@/lib/draft-storage'
import type { HospitalRegistrationInput } from '@/lib/validations/hospital-registration'
import { hospitalDocumentsStepSchema } from '@/lib/validations/hospital-registration'
import type { RegistrationAccountInput } from '@iha/validations/provider-registration'
import type { z } from 'zod'
import { WizardLayout, AccountStep, AgreementStep } from '@iha/ui'
import { HospitalBasicInfoStep } from './hospital-basic-info-step'
import { HospitalLocationStep } from './hospital-location-step'
import { VerifyEmailStep } from './verify-email-step'
import { HospitalDetailsStep } from './hospital-details-step'
import { HospitalDocumentsStep } from './hospital-documents-step'

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7

const STEPS = [
  { key: 1, label: 'Account' },
  { key: 2, label: 'Verify Email' },
  { key: 3, label: 'Basic Information' },
  { key: 4, label: 'Location' },
  { key: 5, label: 'Hospital Details' },
  { key: 6, label: 'Document' },
  { key: 7, label: 'Agreement' },
]

type BasicInfo = Pick<HospitalRegistrationInput, 'name' | 'registrationNumber' | 'abnNumber' | 'phone'>
type Location = Pick<HospitalRegistrationInput, 'country' | 'city' | 'address' | 'zipCode'>
type Details = Pick<
  HospitalRegistrationInput,
  'registrationType' | 'specialties' | 'bedCount' | 'roomTypes' | 'licenseNumber' | 'accreditationBody'
>
type Documents = z.infer<typeof hospitalDocumentsStepSchema>

type Draft = {
  basicInfo?: BasicInfo
  location?: Location
  details?: Details
  documents?: Documents
}

type PersistedState = {
  step: Step
  draft: Draft
  userId: string | null
  email: string | null
}

const DRAFT_NAME = 'hospital-registration-wizard'

type Props = {
  initialStep: Step
  userId: string | null
  specialties: SpecialtyOption[]
}

export function HospitalRegistrationWizard({ initialStep, userId: initialUserId, specialties }: Props) {
  const router = useRouter()
  const [step, setStep] = useState<Step>(initialStep)
  const [userId, setUserId] = useState<string | null>(initialUserId)
  const [email, setEmail] = useState<string | null>(null)
  const [draft, setDraft] = useState<Draft>({})
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [isRestored, setIsRestored] = useState(false)

  // Restore synchronously-unavailable sessionStorage state before any step form
  // mounts — react-hook-form only reads `defaultValues` on first mount, so
  // setting draft/step after that point wouldn't repopulate the fields.
  useEffect(() => {
    const saved = loadDraft<PersistedState>(DRAFT_NAME)
    if (saved && typeof saved.step === 'number' && saved.draft) {
      setStep(saved.step)
      setDraft(saved.draft)
      if (saved.userId) setUserId(saved.userId)
      if (saved.email) setEmail(saved.email)
    }
    setIsRestored(true)
  }, [])

  useEffect(() => {
    if (!isRestored) return
    saveDraft(DRAFT_NAME, { step, draft, userId, email })
  }, [isRestored, step, draft, userId, email])

  async function handleAccountSubmit(values: RegistrationAccountInput) {
    const result = await signUpForRegistration(values, 'hospital')
    if (!result.data) {
      return { error: result.error ?? 'Please check your details.' }
    }
    setUserId(result.data.userId)
    setEmail(result.data.email)
    setStep(2)
    return {}
  }

  async function handleFinalSubmit() {
    if (!draft.basicInfo || !draft.location || !draft.details || !draft.documents) return

    setIsSubmitting(true)
    const { hospitalLicense, registrationCertificate, otherDocuments } = draft.documents
    const result = await submitHospitalRegistration({
      ...draft.basicInfo,
      ...draft.location,
      ...draft.details,
      certificates: [
        ...(hospitalLicense ? [hospitalLicense] : []),
        ...(registrationCertificate ? [registrationCertificate] : []),
        ...otherDocuments,
      ],
    })
    setIsSubmitting(false)

    if (!result.data) {
      toast.error(result.error ?? 'Something went wrong. Please try again.', { duration: Infinity })
      return
    }

    clearDraft(DRAFT_NAME)
    router.push(result.data.redirectTo)
    router.refresh()
  }

  return (
    <WizardLayout eyebrow="Hospital Registration" steps={STEPS} currentStep={step}>
      {isRestored && (
        <>
          {step === 1 && <AccountStep onSubmit={handleAccountSubmit} />}

          {step === 2 && email && <VerifyEmailStep email={email} onNext={() => setStep(3)} />}

          {step === 3 && (
            <HospitalBasicInfoStep
              defaultValues={draft.basicInfo}
              onNext={(values) => {
                setDraft((d) => ({ ...d, basicInfo: values }))
                setStep(4)
              }}
            />
          )}

          {step === 4 && (
            <HospitalLocationStep
              defaultValues={draft.location}
              onNext={(values) => {
                setDraft((d) => ({ ...d, location: values }))
                setStep(5)
              }}
              onBack={() => setStep(3)}
            />
          )}

          {step === 5 && (
            <HospitalDetailsStep
              specialties={specialties}
              defaultValues={draft.details}
              onNext={(values) => {
                setDraft((d) => ({ ...d, details: values }))
                setStep(6)
              }}
              onBack={() => setStep(4)}
            />
          )}

          {step === 6 && userId && (
            <HospitalDocumentsStep
              uploadPathPrefix={userId}
              defaultValues={draft.documents}
              onNext={(values) => {
                setDraft((d) => ({ ...d, documents: values }))
                setStep(7)
              }}
              onBack={() => setStep(5)}
            />
          )}

          {step === 7 && (
            <AgreementStep isSubmitting={isSubmitting} onSubmit={handleFinalSubmit} onBack={() => setStep(6)} />
          )}
        </>
      )}
    </WizardLayout>
  )
}
