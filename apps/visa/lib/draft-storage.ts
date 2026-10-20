const DRAFT_PREFIX = 'visa-draft:'

/**
 * In-progress registration wizard drafts use sessionStorage, not
 * localStorage: it survives a refresh (same tab) but is gone once the
 * tab/browser closes, so a half-filled registration form doesn't linger on a
 * shared device indefinitely.
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
