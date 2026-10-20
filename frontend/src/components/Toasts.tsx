import { createContext, useCallback, useContext, useState, type ReactNode } from 'react'

type Toast = {
  id: number
  title: string
  body?: string
  action?: { label: string; onClick: () => void }
  tone?: 'good' | 'bad'
}

const ToastContext = createContext<(toast: Omit<Toast, 'id'>) => void>(() => {})

let nextId = 0

export function ToastProvider({ children }: { children: ReactNode }) {
  const [toasts, setToasts] = useState<Toast[]>([])

  const dismiss = useCallback(
    (id: number) => setToasts((all) => all.filter((t) => t.id !== id)),
    [],
  )

  const show = useCallback(
    (toast: Omit<Toast, 'id'>) => {
      const id = ++nextId
      setToasts((all) => [...all.slice(-3), { ...toast, id }])
      setTimeout(() => dismiss(id), 6000)
    },
    [dismiss],
  )

  return (
    <ToastContext.Provider value={show}>
      {children}
      <div className="toasts" aria-live="polite">
        {toasts.map((toast) => (
          <div key={toast.id} className={`toast${toast.tone ? ` toast-${toast.tone}` : ''}`}>
            <div>
              <p className="toast-title">{toast.title}</p>
              {toast.body && <p className="small muted">{toast.body}</p>}
            </div>
            <div className="toast-actions">
              {toast.action && (
                <button
                  type="button"
                  className="button-link"
                  onClick={() => {
                    toast.action!.onClick()
                    dismiss(toast.id)
                  }}
                >
                  {toast.action.label}
                </button>
              )}
              <button
                type="button"
                className="icon-button"
                aria-label="Dismiss"
                onClick={() => dismiss(toast.id)}
              >
                ×
              </button>
            </div>
          </div>
        ))}
      </div>
    </ToastContext.Provider>
  )
}

export function useToast() {
  return useContext(ToastContext)
}
