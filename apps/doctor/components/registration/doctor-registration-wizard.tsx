'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import type { SpecialtyOption } from '@iha/db/specialties'
import { signUpForRegistration, submitDoctorRegistration } from '@/lib/actions/registration'
import { loadDraft, saveDraft, clearDraft } from '@/lib/draft-storage'
import type { HospitalOption } from '@/lib/data/hospitals'
import type { RegistrationAccountInput } from '@iha/validations/provider-registration'
import { doctorDocumentsStepSchema, type DoctorRegistrationInput } from '@/lib/validations/doctor-registration'
import type { z } from 'zod'
import { WizardLayout, AccountStep, AgreementStep } from '@iha/ui'
import { VerifyEmailStep } from './verify-email-step'
import { DoctorBasicInfoStep } from './doctor-basic-info-step'
import { DoctorProfessionalStep } from './doctor-professional-step'
import { DoctorHospitalStep } from './doctor-hospital-step'
import { DoctorDocumentsStep } from './doctor-documents-step'
import { RegistrationFeeSidebarNotice, RegistrationFeeAgreementNotice } from './fee-notice'

type Step = 1 | 2 | 3 | 4 | 5 | 6 | 7

const STEPS = [
  { key: 1, label: 'Account' },
  { key: 2, label: 'Verify Email' },
  { key: 3, label: 'Basic Information' },
  { key: 4, label: 'Professional Details' },
  { key: 5, label: 'Hospital Details' },
  { key: 6, label: 'Verification & Setup' },
  { key: 7, label: 'Agreement' },
]

type BasicInfo = Pick<DoctorRegistrationInput, 'fullName' | 'contactPhone' | 'profilePhoto'>
type Professional = Pick<
  DoctorRegistrationInput,
  'specialties' | 'qualifications' | 'yearsOfExperience' | 'licenseNumber' | 'bio' | 'languagesSpoken'
>
type Hospital = Pick<DoctorRegistrationInput, 'department' | 'role' | 'hospitalAffiliations' | 'workingDays'>
type Documents = z.infer<typeof doctorDocumentsStepSchema>

type Draft = {
  basicInfo?: BasicInfo
  professional?: Professional
  hospital?: Hospital
  documents?: Documents
}

type PersistedState = {
  step: Step
  draft: Draft
  userId: string | null
  email: string | null
}

const DRAFT_NAME = 'doctor-registration-wizard'

type Props = {
  initialStep: Step
  userId: string | null
  specialties: SpecialtyOption[]
  hospitalOptions: HospitalOption[]
  registrationFeeAud: number
}

export function DoctorRegistrationWizard({
  initialStep,
  userId: initialUserId,
  specialties,
  hospitalOptions,
  registrationFeeAud,
}: Props) {
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
    const result = await signUpForRegistration(values, 'doctor')
    if (!result.data) {
      return { error: result.error ?? 'Please check your details.' }
    }
    setUserId(result.data.userId)
    setEmail(result.data.email)
    setStep(2)
    return {}
  }

  async function handleFinalSubmit() {
    if (!draft.basicInfo || !draft.professional || !draft.hospital || !draft.documents) return

    setIsSubmitting(true)
    const { medicalLicense, degreeCertificate } = draft.documents
    const result = await submitDoctorRegistration({
      ...draft.basicInfo,
      ...draft.professional,
      ...draft.hospital,
      certificates: [...(medicalLicense ? [medicalLicense] : []), ...(degreeCertificate ? [degreeCertificate] : [])],
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
    <WizardLayout
      eyebrow="Doctor Registration"
      steps={STEPS}
      currentStep={step}
      sidebarNotice={<RegistrationFeeSidebarNotice amountAud={registrationFeeAud} />}
    >
      {isRestored && (
        <>
          {step === 1 && <AccountStep onSubmit={handleAccountSubmit} />}

          {step === 2 && email && <VerifyEmailStep email={email} onNext={() => setStep(3)} />}

          {step === 3 && userId && (
            <DoctorBasicInfoStep
              uploadPathPrefix={userId}
              defaultValues={draft.basicInfo}
              onNext={(values) => {
                setDraft((d) => ({ ...d, basicInfo: values }))
                setStep(4)
              }}
            />
          )}

          {step === 4 && (
            <DoctorProfessionalStep
              specialties={specialties}
              defaultValues={draft.professional}
              onNext={(values) => {
                setDraft((d) => ({ ...d, professional: values }))
                setStep(5)
              }}
              onBack={() => setStep(3)}
            />
          )}

          {step === 5 && (
            <DoctorHospitalStep
              hospitalOptions={hospitalOptions}
              defaultValues={draft.hospital}
              onNext={(values) => {
                setDraft((d) => ({ ...d, hospital: values }))
                setStep(6)
              }}
              onBack={() => setStep(4)}
            />
          )}

          {step === 6 && userId && (
            <DoctorDocumentsStep
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
            <>
              <RegistrationFeeAgreementNotice amountAud={registrationFeeAud} />
              <AgreementStep isSubmitting={isSubmitting} onSubmit={handleFinalSubmit} onBack={() => setStep(6)} />
            </>
          )}
        </>
      )}
    </WizardLayout>
  )
}
