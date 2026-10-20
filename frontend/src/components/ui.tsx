import { useEffect, useRef, type ReactNode } from 'react'
import { ApiError } from '../lib/api'
import { useT } from '../i18n/I18nContext'
import { STATUS_TONE, type CaseStatus, type Tone } from '../lib/cases'

/** Label + control + hint/error, stacked. */
export function Field({
  label,
  error,
  hint,
  children,
  optional,
}: {
  label: ReactNode
  error?: string
  hint?: ReactNode
  children: ReactNode
  optional?: boolean
}) {
  return (
    <label className="field">
      <span className="field-label">
        {label}
        {optional && <span className="muted small"> (optional)</span>}
      </span>
      {children}
      {error ? (
        <span className="field-error">{error}</span>
      ) : hint ? (
        <span className="field-hint">{hint}</span>
      ) : null}
    </label>
  )
}

/** Shows an API error's message, or a generic one for network failures. */
export function FormError({ error }: { error: unknown }) {
  const t = useT('auth')
  if (!error) return null
  const message = error instanceof ApiError ? error.message : t('networkError')
  return (
    <p className="form-error" role="alert">
      {message}
    </p>
  )
}

export function fieldError(error: unknown, field: string): string | undefined {
  return error instanceof ApiError ? error.fieldErrors[field] : undefined
}

export function Badge({
  tone,
  children,
  small,
}: {
  tone: Tone
  children: ReactNode
  small?: boolean
}) {
  return <span className={`badge badge-${tone}${small ? ' badge-sm' : ''}`}>{children}</span>
}

export function StatusBadge({ status, small }: { status: CaseStatus; small?: boolean }) {
  const t = useT('caseStatus')
  return (
    <Badge tone={STATUS_TONE[status]} small={small}>
      {t(`${status}.label`)}
    </Badge>
  )
}

export function Loading() {
  const t = useT('common')
  return (
    <p className="muted loading" aria-live="polite">
      {t('loading')}
    </p>
  )
}

export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const t = useT('errors')
  return (
    <div className="card empty" role="alert">
      <h2>{t('title')}</h2>
      <FormError error={error} />
      {onRetry && (
        <button type="button" className="button-secondary" onClick={onRetry}>
          {t('tryAgain')}
        </button>
      )}
    </div>
  )
}

export function Empty({ title, children }: { title: string; children?: ReactNode }) {
  return (
    <div className="card empty">
      <h2>{title}</h2>
      {children}
    </div>
  )
}

/** A native <dialog>, so focus trapping and Escape come from the browser. */
export function Modal({
  open,
  onClose,
  title,
  children,
  wide,
}: {
  open: boolean
  onClose: () => void
  title: ReactNode
  children: ReactNode
  wide?: boolean
}) {
  const ref = useRef<HTMLDialogElement>(null)
  useEffect(() => {
    const dialog = ref.current
    if (!dialog) return
    if (open && !dialog.open) dialog.showModal()
    if (!open && dialog.open) dialog.close()
  }, [open])
  return (
    <dialog
      ref={ref}
      className={`modal${wide ? ' modal-wide' : ''}`}
      onClose={onClose}
      onClick={(e) => e.target === ref.current && onClose()}
    >
      {open && (
        <div className="modal-body">
          <div className="modal-header">
            <h2>{title}</h2>
            <button type="button" className="icon-button" aria-label="Close" onClick={onClose}>
              ×
            </button>
          </div>
          {children}
        </div>
      )}
    </dialog>
  )
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: { id: T; label: ReactNode }[]
  active: T
  onChange: (id: T) => void
}) {
  return (
    <div className="tabs" role="tablist">
      {tabs.map((tab) => (
        <button
          key={tab.id}
          type="button"
          role="tab"
          aria-selected={tab.id === active}
          className={tab.id === active ? 'tab active' : 'tab'}
          onClick={() => onChange(tab.id)}
        >
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/** Click-or-drop file chooser. */
export function FileDrop({
  onFiles,
  accept = '.pdf,.jpg,.jpeg,.png',
  multiple = true,
  label,
  hint,
  disabled,
}: {
  onFiles: (files: File[]) => void
  accept?: string
  multiple?: boolean
  label: ReactNode
  hint?: ReactNode
  disabled?: boolean
}) {
  return (
    <label
      className={`file-drop${disabled ? ' disabled' : ''}`}
      onDragOver={(e) => e.preventDefault()}
      onDrop={(e) => {
        e.preventDefault()
        if (!disabled) onFiles(Array.from(e.dataTransfer.files))
      }}
    >
      <input
        type="file"
        multiple={multiple}
        accept={accept}
        disabled={disabled}
        onChange={(e) => {
          onFiles(Array.from(e.target.files ?? []))
          e.target.value = ''
        }}
      />
      <span className="file-drop-label">{label}</span>
      {hint && <span className="muted small">{hint}</span>}
    </label>
  )
}

export function Stepper({ steps, current }: { steps: string[]; current: number }) {
  return (
    <ol className="stepper">
      {steps.map((step, i) => (
        <li key={step} className={i < current ? 'done' : i === current ? 'current' : ''}>
          <span className="stepper-dot">{i < current ? '✓' : i + 1}</span>
          <span className="stepper-label">{step}</span>
        </li>
      ))}
    </ol>
  )
}
