'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useForm } from 'react-hook-form'
import { zodResolver } from '@hookform/resolvers/zod'
import { toast } from 'sonner'
import { useTranslations } from 'next-intl'
import {
  personalInfoSchema,
  medicalBackgroundSchema,
  emergencyContactSchema,
  type PersonalInfoInput,
  type MedicalBackgroundInput,
  type EmergencyContactInput,
} from '@iha/validations'
import type { Patient } from '@iha/db/types'
import { updatePersonalInfo, updateMedicalBackground, updateEmergencyContact } from '@/lib/actions/profile'
import { loadDraft, saveDraft, clearDraft } from '@/lib/draft-storage'
import { PersonalInfoStep } from './personal-info-step'
import { MedicalBackgroundStep } from './medical-background-step'
import { EmergencyContactStep } from './emergency-contact-step'

type Step = 1 | 2 | 3

const STEP_KEYS = ['personalInfo', 'medicalBackground', 'emergencyContact'] as const

type Props = {
  patient: Patient
  userEmail: string
}

export function ProfileSetupWizard({ patient, userEmail }: Props) {
  const t = useTranslations('profile.setupWizard')
  const [step, setStep] = useState<Step>(1)
  const [avatarUrl, setAvatarUrl] = useState<string | null>(patient.avatar_url ?? null)
  const router = useRouter()

  const personalInfoForm = useForm<PersonalInfoInput>({
    resolver: zodResolver(personalInfoSchema),
    defaultValues: {
      full_name: patient.full_name ?? '',
      date_of_birth: patient.date_of_birth ?? '',
      gender: (patient.gender as PersonalInfoInput['gender']) ?? undefined,
      nationality: patient.nationality ?? '',
      country_of_residence: patient.country_of_residence ?? '',
      phone: patient.phone ?? '',
      address: patient.address ?? '',
    },
  })

  const medicalForm = useForm<MedicalBackgroundInput>({
    resolver: zodResolver(medicalBackgroundSchema),
    defaultValues: {
      medical_history: patient.medical_history ?? '',
      allergies: patient.allergies ?? [],
      current_medications: patient.current_medications ?? [],
      past_surgeries: patient.past_surgeries ?? '',
    },
  })

  const emergencyForm = useForm<EmergencyContactInput>({
    resolver: zodResolver(emergencyContactSchema),
    defaultValues: {
      emergency_contact_name: patient.emergency_contact_name ?? '',
      emergency_contact_relationship: patient.emergency_contact_relationship ?? '',
      emergency_contact_phone: patient.emergency_contact_phone ?? '',
    },
  })

  const draftName = `profile-wizard:${patient.id}`

  // Restore draft from sessionStorage on mount
  useEffect(() => {
    const saved = loadDraft<{
      step?: Step
      personalInfo?: PersonalInfoInput
      medical?: MedicalBackgroundInput
      emergency?: EmergencyContactInput
    }>(draftName)
    if (!saved) return
    if (saved.step) setStep(saved.step)
    if (saved.personalInfo) personalInfoForm.reset(saved.personalInfo)
    if (saved.medical) medicalForm.reset(saved.medical)
    if (saved.emergency) emergencyForm.reset(saved.emergency)
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  // Persist step and form values whenever they change
  useEffect(() => {
    function persist() {
      saveDraft(draftName, {
        step,
        personalInfo: personalInfoForm.getValues(),
        medical: medicalForm.getValues(),
        emergency: emergencyForm.getValues(),
      })
    }

    persist()

    const subs = [
      personalInfoForm.watch(persist),
      medicalForm.watch(persist),
      emergencyForm.watch(persist),
    ]

    return () => subs.forEach((s) => s.unsubscribe())
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step])

  async function handlePersonalInfoNext(data: PersonalInfoInput) {
    const result = await updatePersonalInfo(data)
    if (result.error) {
      personalInfoForm.setError('root', { message: result.error })
      return
    }
    setStep(2)
  }

  async function handleMedicalNext(data: MedicalBackgroundInput) {
    const result = await updateMedicalBackground(data)
    if (result.error) {
      medicalForm.setError('root', { message: result.error })
      return
    }
    setStep(3)
  }

  async function handleEmergencySubmit(data: EmergencyContactInput) {
    const result = await updateEmergencyContact(data)
    if (result.error) {
      emergencyForm.setError('root', { message: result.error })
      return
    }
    clearDraft(draftName)
    toast.success(t('completedToast'))
    router.push('/dashboard')
  }

  return (
    <div className="w-full">
      {/* Step tabs */}
      <div className="mb-1 flex border-b border-slate-200">
        {STEP_KEYS.map((stepKey, i) => {
          const key = (i + 1) as Step
          return (
            <div
              key={key}
              className={`flex-1 whitespace-nowrap border-b-2 pb-3 text-center text-xs font-medium transition-colors sm:text-sm ${
                step === key
                  ? 'border-cyan-500 text-cyan-700'
                  : step > key
                    ? 'border-slate-300 text-slate-500'
                    : 'border-transparent text-slate-400'
              }`}
            >
              <span className="sm:hidden">{t(`steps.${stepKey}.shortLabel`)}</span>
              <span className="hidden sm:inline">{t(`steps.${stepKey}.label`)}</span>
            </div>
          )
        })}
      </div>

      {/* Step title */}
      <div className="mb-5 mt-5 text-center">
        <h2 className="text-xl font-semibold text-slate-900">
          {t(`steps.${STEP_KEYS[step - 1]}.title`)}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {t(`steps.${STEP_KEYS[step - 1]}.subtitle`)}
        </p>
      </div>

      {step === 1 && (
        <PersonalInfoStep
          form={personalInfoForm}
          userEmail={userEmail}
          userId={patient.user_id}
          avatarUrl={avatarUrl}
          onAvatarChange={setAvatarUrl}
          onNext={handlePersonalInfoNext}
        />
      )}
      {step === 2 && (
        <MedicalBackgroundStep
          form={medicalForm}
          onNext={handleMedicalNext}
          onBack={() => setStep(1)}
        />
      )}
      {step === 3 && (
        <EmergencyContactStep
          form={emergencyForm}
          onSubmit={handleEmergencySubmit}
          onBack={() => setStep(2)}
        />
      )}
    </div>
  )
}
