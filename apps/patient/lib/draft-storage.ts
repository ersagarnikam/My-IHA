const DRAFT_PREFIX = 'patient-draft:'

/**
 * In-progress form drafts use sessionStorage, not localStorage: it survives a
 * refresh (same tab) but is gone once the tab/browser closes, so a case,
 * profile, or visa draft containing medical/PII fields doesn't linger on a
 * shared device indefinitely. Callers must scope `name` by patient/case id
 * so two accounts on the same browser never inherit each other's draft.
 */
export function loadDraft<T>(name: string): T | null {
  if (typeof window === 'undefined') return null
  const raw = sessionStorage.getItem(DRAFT_PREFIX + name)
  if (!raw) return null
  try {
    return JSON.parse(raw) as T
  } catch {
    sessionStorage.removeItem(DRAFT_PREFIX + name)
    return null
  }
}

export function saveDraft(name: string, value: unknown): void {
  if (typeof window === 'undefined') return
  sessionStorage.setItem(DRAFT_PREFIX + name, JSON.stringify(value))
}

export function clearDraft(name: string): void {
  if (typeof window === 'undefined') return
  sessionStorage.removeItem(DRAFT_PREFIX + name)
}

/** Clears every in-progress draft. Call on logout so a shared device can't carry one patient's draft into the next session's form. */
export function clearAllDrafts(): void {
  if (typeof window === 'undefined') return
  for (let i = sessionStorage.length - 1; i >= 0; i--) {
    const key = sessionStorage.key(i)
    if (key?.startsWith(DRAFT_PREFIX)) sessionStorage.removeItem(key)
  }
}
