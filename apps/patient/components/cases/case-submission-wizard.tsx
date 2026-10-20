'use client'

import { useEffect, useState } from 'react'
import { ArrowLeft, Check } from 'lucide-react'
import { toast } from 'sonner'
import Link from 'next/link'
import { useTranslations } from 'next-intl'
import { type MedicalDetailsInput, type SubmittedDocument } from '@iha/validations'
import type { SpecialtyOption } from '@iha/db/specialties'
import { submitCase } from '@/lib/actions/cases'
import { loadDraft, saveDraft, clearDraft } from '@/lib/draft-storage'
import { ConditionDetailsStep } from './condition-details-step'
import { DocumentUploadStep } from './document-upload-step'
import { ReviewStep } from './review-step'
import { SubmissionSuccess } from './submission-success'

type Step = 1 | 2 | 3

const STEP_KEYS = [
  { key: 1 as Step, labelKey: 'conditionDetails' as const },
  { key: 2 as Step, labelKey: 'uploadDocuments' as const },
  { key: 3 as Step, labelKey: 'reviewSubmit' as const },
]

type Props = { patientId: string; specialties: SpecialtyOption[] }

type State = {
  step: Step | 'success'
  medicalDetails: MedicalDetailsInput | null
  documents: SubmittedDocument[]
  result: { caseId: string; referenceNumber: string } | null
}

export function CaseSubmissionWizard({ patientId, specialties }: Props) {
  const t = useTranslations('caseWizard')
  const [state, setState] = useState<State>({
    step: 1,
    medicalDetails: null,
    documents: [],
    result: null,
  })
  const [isSubmitting, setIsSubmitting] = useState(false)

  const draftName = `case-wizard:${patientId}`

  // Gates the save-effect below until the restore below has actually applied
  // (or found nothing to apply). Without this, the save-effect's first run
  // fires with the pre-restore default state and immediately overwrites the
  // just-loaded draft in storage before the restored state has landed —
  // permanently clobbering it (React Strict Mode's double-invoke makes this
  // deterministic in dev, not just a rare race).
  const [hydrated, setHydrated] = useState(false)

  // Restore draft from sessionStorage on mount
  useEffect(() => {
    const saved = loadDraft<{
      step?: Step
      medicalDetails?: MedicalDetailsInput | null
      documents?: SubmittedDocument[]
    }>(draftName)
    if (saved) {
      setState((prev) => ({
        ...prev,
        step: saved.step ?? 1,
        medicalDetails: saved.medicalDetails ?? null,
        documents: saved.documents ?? [],
      }))
    }
    setHydrated(true)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist step and form data whenever state changes
  useEffect(() => {
    if (!hydrated) return
    if (state.step === 'success') return
    saveDraft(draftName, {
      step: state.step,
      medicalDetails: state.medicalDetails,
      documents: state.documents,
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [state, hydrated])

  function handleMedicalDetailsNext(data: MedicalDetailsInput) {
    setState((prev) => ({ ...prev, step: 2, medicalDetails: data }))
  }

  function handleDocumentsNext(docs: SubmittedDocument[]) {
    setState((prev) => ({ ...prev, step: 3, documents: docs }))
  }

  async function handleSubmit() {
    if (!state.medicalDetails) return
    setIsSubmitting(true)

    const result = await submitCase({
      medicalDetails: state.medicalDetails,
      documents: state.documents,
    })

    setIsSubmitting(false)

    if (result.error) {
      toast.error(result.error, { duration: Infinity })
      return
    }

    clearDraft(draftName)
    setState((prev) => ({
      ...prev,
      step: 'success',
      result: result.data,
    }))
  }

  if (state.step === 'success' && state.result) {
    return (
      <div className="rounded-xl bg-white p-6 shadow-sm">
        <SubmissionSuccess
          caseId={state.result.caseId}
          referenceNumber={state.result.referenceNumber}
        />
      </div>
    )
  }

  const currentStep = state.step as Step

  return (
    <div className="space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3">
        <Link
          href="/cases"
          className="flex h-7 w-7 items-center justify-center rounded-full border border-slate-200 bg-white text-slate-500 transition hover:bg-slate-50"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-base font-semibold text-slate-900">{t('title')}</h1>
      </div>

      {/* Step indicator */}
      <div className="flex items-center gap-0">
        {STEP_KEYS.map(({ key, labelKey }, i) => {
          const done = currentStep > key
          const active = currentStep === key
          return (
            <div key={key} className="flex items-center">
              <div className="flex items-center gap-2">
                <div
                  className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-full text-xs font-bold transition ${
                    done
                      ? 'bg-cyan-600 text-white'
                      : active
                        ? 'bg-cyan-600 text-white'
                        : 'border border-slate-300 bg-white text-slate-400'
                  }`}
                >
                  {done ? <Check className="h-3.5 w-3.5" /> : key}
                </div>
                <span
                  className={`hidden text-xs sm:block ${
                    active ? 'font-semibold text-slate-900' : 'text-slate-400'
                  }`}
                >
                  {t(`steps.${labelKey}`)}
                </span>
              </div>
              {i < STEP_KEYS.length - 1 && (
                <div className={`mx-3 h-px w-8 sm:w-16 ${done ? 'bg-cyan-400' : 'bg-slate-200'}`} />
              )}
            </div>
          )
        })}
      </div>

      {/* Step content */}
      <div className="rounded-xl bg-white p-6 shadow-sm">
        {currentStep === 1 && (
          <ConditionDetailsStep
            specialties={specialties}
            defaultValues={state.medicalDetails ?? undefined}
            onNext={handleMedicalDetailsNext}
          />
        )}
        {currentStep === 2 && (
          <DocumentUploadStep
            defaultFiles={state.documents.map((d) => ({ ...d, status: 'done' as const }))}
            onNext={handleDocumentsNext}
            onBack={() => setState((prev) => ({ ...prev, step: 1 }))}
          />
        )}
        {currentStep === 3 && state.medicalDetails && (
          <ReviewStep
            specialties={specialties}
            medicalDetails={state.medicalDetails}
            documents={state.documents}
            isSubmitting={isSubmitting}
            onSubmit={handleSubmit}
            onBack={() => setState((prev) => ({ ...prev, step: 2 }))}
          />
        )}
      </div>
    </div>
  )
}
