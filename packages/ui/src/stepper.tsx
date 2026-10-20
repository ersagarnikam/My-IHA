import { Check } from 'lucide-react'
import { cn } from './lib/utils'

export type StepperStep = {
  key: number
  label: string
}

export type StepperProps = {
  steps: StepperStep[]
  currentStep: number
  orientation?: 'horizontal' | 'vertical'
}

export function Stepper({ steps, currentStep, orientation = 'horizontal' }: StepperProps) {
  if (orientation === 'vertical') {
    return (
      <nav className="flex flex-col">
        {steps.map(({ key, label }, i) => {
          const done = currentStep > key
          const active = currentStep === key
          return (
            <div key={key} className="flex gap-3">
              <div className="flex flex-col items-center">
                <div
                  className={cn(
                    'flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-sm font-semibold',
                    done || active
                      ? 'bg-cyan-600 text-white'
                      : 'border border-slate-300 bg-white text-slate-400',
                  )}
                >
                  {done ? <Check className="h-4 w-4" /> : key}
                </div>
                {i < steps.length - 1 && (
                  <div className={cn('my-1 w-px flex-1', done ? 'bg-cyan-400' : 'bg-slate-200')} />
                )}
              </div>
              <span
                className={cn(
                  'pb-8 pt-1.5 text-sm',
                  active ? 'font-semibold text-slate-900' : done ? 'text-slate-600' : 'text-slate-400',
                )}
              >
                {label}
              </span>
            </div>
          )
        })}
      </nav>
    )
  }

  return (
    <div className="flex items-center gap-0">
      {steps.map(({ key, label }, i) => {
        const done = currentStep > key
        const active = currentStep === key
        return (
          <div key={key} className="flex items-center">
            <div
              className={cn(
                'flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold',
                done || active
                  ? 'bg-cyan-600 text-white'
                  : 'border border-slate-300 text-slate-400',
              )}
            >
              {done ? <Check className="h-3.5 w-3.5" /> : key}
            </div>
            <span
              className={cn(
                'ml-2 hidden text-sm sm:inline',
                active ? 'font-semibold text-slate-900' : 'text-slate-400',
              )}
            >
              {label}
            </span>
            {i < steps.length - 1 && (
              <div
                className={cn('mx-3 h-px w-8 sm:w-16', done ? 'bg-cyan-400' : 'bg-slate-200')}
              />
            )}
          </div>
        )
      })}
    </div>
  )
}
