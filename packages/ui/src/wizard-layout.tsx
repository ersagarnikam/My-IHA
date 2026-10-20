import { Stepper, type StepperStep } from './stepper'
import { AuthLogo } from './auth'

type Props = {
  eyebrow: string
  steps: StepperStep[]
  currentStep: number
  children: React.ReactNode
  /** Optional card anchored to the bottom of the left sidebar, visible across every step (e.g. a pricing disclosure). Omit for no change in behavior. */
  sidebarNotice?: React.ReactNode
}

/** Two-panel wizard shell filling the viewport: a 20% step-list panel on the left, form content on the right. */
export function WizardLayout({ eyebrow, steps, currentStep, children, sidebarNotice }: Props) {
  return (
    <div className="flex min-h-screen bg-white">
      <aside className="hidden w-[20%] shrink-0 flex-col items-center bg-[#eef4f8] p-8 lg:flex">
        <AuthLogo />
        <div className="mt-10 w-full">
          <Stepper steps={steps} currentStep={currentStep} orientation="vertical" />
        </div>
        {sidebarNotice && <div className="mt-auto w-full pt-8">{sidebarNotice}</div>}
      </aside>
      <div className="flex-1 px-6 py-10 sm:px-12">
        <div className="mx-auto w-full max-w-2xl">
          <div className="mb-6 flex items-center justify-between border-b border-slate-200 pb-4">
            <p className="text-xl font-bold text-black">{eyebrow}</p>
            <span className="text-sm text-muted-foreground">
              Step {currentStep} of {steps.length}
            </span>
          </div>
          {children}
        </div>
      </div>
    </div>
  )
}
