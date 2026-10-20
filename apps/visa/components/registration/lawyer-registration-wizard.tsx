'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { toast } from 'sonner'
import { signUpForRegistration, submitLawyerRegistration } from '@/lib/actions/registration'
import { loadDraft, saveDraft, clearDraft } from '@/lib/draft-storage'
import type { LawyerRegistrationInput } from '@/lib/validations/lawyer-registration'
import { lawyerDocumentsStepSchema } from '@/lib/validations/lawyer-registration'
import type { RegistrationAccountInput } from '@iha/validations/provider-registration'
import type { z } from 'zod'
import { WizardLayout, AccountStep, AgreementStep } from '@iha/ui'
import { LawyerDetailsStep } from './lawyer-details-step'
import { LawyerDocumentsStep } from './lawyer-documents-step'
import { VerifyEmailStep } from './verify-email-step'

type Step = 1 | 2 | 3 | 4 | 5

const STEPS = [
  { key: 1, label: 'Account' },
  { key: 2, label: 'Verify Email' },
  { key: 3, label: 'Details' },
  { key: 4, label: 'Document' },
  { key: 5, label: 'Agreement' },
]

type Details = Pick<
  LawyerRegistrationInput,
  | 'lawyerType'
  | 'name'
  | 'registrationNumber'
  | 'abnNumber'
  | 'immigrationLawCertification'
  | 'phone'
  | 'address'
  | 'city'
  | 'zipCode'
>
type Documents = z.infer<typeof lawyerDocumentsStepSchema>

type Draft = {
  details?: Details
  documents?: Documents
}

type PersistedState = {
  step: Step
  draft: Draft
  userId: string | null
  email: string | null
}

const DRAFT_NAME = 'lawyer-registration-wizard'

type Props = {
  initialStep: Step
  userId: string | null
}

export function LawyerRegistrationWizard({ initialStep, userId: initialUserId }: Props) {
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
    const result = await signUpForRegistration(values, 'visa_lawyer')
    if (!result.data) {
      return { error: result.error ?? 'Please check your details.' }
    }
    setUserId(result.data.userId)
    setEmail(result.data.email)
    setStep(2)
    return {}
  }

  async function handleFinalSubmit() {
    if (!draft.details || !draft.documents) return

    setIsSubmitting(true)
    const { licenseCertificate, immigrationLawCertificationDocument, otherDocuments } = draft.documents
    const result = await submitLawyerRegistration({
      ...draft.details,
      certificates: [
        ...(licenseCertificate ? [licenseCertificate] : []),
        ...(immigrationLawCertificationDocument ? [immigrationLawCertificationDocument] : []),
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
    <WizardLayout eyebrow="Visa Lawyer Registration" steps={STEPS} currentStep={step}>
      {isRestored && (
        <>
          {step === 1 && <AccountStep onSubmit={handleAccountSubmit} />}

          {step === 2 && email && <VerifyEmailStep email={email} onNext={() => setStep(3)} />}

          {step === 3 && (
            <LawyerDetailsStep
              defaultValues={draft.details}
              onNext={(values) => {
                setDraft((d) => ({ ...d, details: values }))
                setStep(4)
              }}
            />
          )}

          {step === 4 && userId && (
            <LawyerDocumentsStep
              uploadPathPrefix={userId}
              defaultValues={draft.documents}
              onNext={(values) => {
                setDraft((d) => ({ ...d, documents: values }))
                setStep(5)
              }}
              onBack={() => setStep(3)}
            />
          )}

          {step === 5 && (
            <AgreementStep isSubmitting={isSubmitting} onSubmit={handleFinalSubmit} onBack={() => setStep(4)} />
          )}
        </>
      )}
    </WizardLayout>
  )
}
