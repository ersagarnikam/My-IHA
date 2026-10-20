import { useState } from 'react'
import { Navigate, useNavigate } from 'react-router'
import { LanguageSwitcher } from '../../../components/LanguageSwitcher'
import { useToast } from '../../../components/Toasts'
import { Stepper } from '../../../components/ui'
import { useT } from '../../../i18n/I18nContext'
import { usePatient } from '../PatientContext'
import { EmergencyContactForm, MedicalBackgroundForm, PersonalInfoForm } from './ProfileForms'

const STEPS = ['personalInfo', 'medicalBackground', 'emergencyContact'] as const

/** 3-step onboarding; each step saves immediately, like the old ProfileSetupWizard. */
export function ProfileSetupPage() {
  const t = useT('profile.setupWizard')
  const { profile, reloadProfile } = usePatient()
  const navigate = useNavigate()
  const toast = useToast()
  const [step, setStep] = useState(0)

  if (profile.profileComplete && step === 0) return <Navigate to="/patient/dashboard" replace />

  const next = async () => {
    await reloadProfile()
    setStep((s) => s + 1)
  }
  const back = (
    <button type="button" className="button-secondary" onClick={() => setStep((s) => s - 1)}>
      {t('back')}
    </button>
  )
  const current = STEPS[step]!

  return (
    <div className="auth-shell">
      <section className="card setup-card stack">
        <div className="auth-top">
          <span className="brand">MTA</span>
          <LanguageSwitcher />
        </div>
        <Stepper steps={STEPS.map((s) => t(`steps.${s}.shortLabel`))} current={step} />
        <div>
          <h1>{t(`steps.${current}.title`)}</h1>
          <p className="muted">{t(`steps.${current}.subtitle`)}</p>
        </div>
        {step === 0 && (
          <PersonalInfoForm profile={profile} onSaved={next} submitLabel={t('next')} />
        )}
        {step === 1 && (
          <MedicalBackgroundForm
            profile={profile}
            onSaved={next}
            submitLabel={t('next')}
            secondary={back}
          />
        )}
        {step === 2 && (
          <EmergencyContactForm
            profile={profile}
            secondary={back}
            submitLabel={t('submit')}
            onSaved={async () => {
              await reloadProfile()
              toast({ title: t('completedToast'), tone: 'good' })
              navigate('/patient/dashboard', { replace: true })
            }}
          />
        )}
      </section>
    </div>
  )
}
