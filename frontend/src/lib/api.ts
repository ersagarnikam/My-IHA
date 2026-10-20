// Thin fetch wrapper for the Spring API. Errors arrive as RFC 9457 problem
// details with a machine-readable `code` (see GlobalExceptionHandler).

const TOKEN_KEY = 'iha.session'

export type Role = 'PATIENT' | 'DOCTOR' | 'HOSPITAL' | 'LAWYER' | 'ADMIN'

export type SessionUser = { id: string; email: string; role: Role }

export type Session = { accessToken: string; expiresAt: string; user: SessionUser }

export class ApiError extends Error {
  constructor(
    readonly status: number,
    readonly code: string,
    message: string,
    readonly fieldErrors: Record<string, string> = {},
  ) {
    super(message)
  }
}

export function loadSession(): Session | null {
  try {
    const raw = localStorage.getItem(TOKEN_KEY)
    if (!raw) return null
    const session = JSON.parse(raw) as Session
    return new Date(session.expiresAt) > new Date() ? session : null
  } catch {
    return null
  }
}

export function saveSession(session: Session | null) {
  try {
    if (session) localStorage.setItem(TOKEN_KEY, JSON.stringify(session))
    else localStorage.removeItem(TOKEN_KEY)
  } catch {
    // Storage unavailable (private mode); the session just won't survive a reload.
  }
}

let onUnauthorized: () => void = () => {}

/** Registered by AuthProvider so an expired token signs the user out everywhere. */
export function setUnauthorizedHandler(handler: () => void) {
  onUnauthorized = handler
}

export function authHeaders(): HeadersInit {
  const session = loadSession()
  return session ? { Authorization: `Bearer ${session.accessToken}` } : {}
}

async function request(path: string, init: RequestInit = {}): Promise<Response> {
  const headers = new Headers(init.headers)
  const session = loadSession()
  if (session) headers.set('Authorization', `Bearer ${session.accessToken}`)
  if (init.body && !(init.body instanceof FormData)) headers.set('Content-Type', 'application/json')

  const response = await fetch(path, { ...init, headers })
  if (response.ok) return response

  if (response.status === 401 && session) onUnauthorized()
  let problem: { code?: string; detail?: string; fieldErrors?: Record<string, string> } = {}
  try {
    problem = await response.json()
  } catch {
    // Non-JSON error body.
  }
  if (problem.code === 'account_deleted') onUnauthorized()
  throw new ApiError(
    response.status,
    problem.code ?? 'http_error',
    problem.detail ?? `Request failed (${response.status})`,
    problem.fieldErrors,
  )
}

async function json<T>(response: Response): Promise<T> {
  return (response.status === 204 ? undefined : await response.json()) as T
}

function body(value: unknown): BodyInit {
  return value instanceof FormData ? value : JSON.stringify(value ?? {})
}

export async function apiGet<T>(path: string): Promise<T> {
  return json<T>(await request(path))
}

export async function apiPost<T>(path: string, value?: unknown): Promise<T> {
  return json<T>(await request(path, { method: 'POST', body: body(value) }))
}

export async function apiPut<T>(path: string, value?: unknown): Promise<T> {
  return json<T>(await request(path, { method: 'PUT', body: body(value) }))
}

export async function apiDelete<T>(path: string, value?: unknown): Promise<T> {
  return json<T>(
    await request(path, { method: 'DELETE', body: value === undefined ? undefined : body(value) }),
  )
}

export async function apiBlob(path: string): Promise<Blob> {
  return (await request(path)).blob()
}

/**
 * Files need the bearer token, so they're fetched as blobs. The tab is opened
 * before the await so popup blockers treat it as user-initiated.
 */
export async function openFile(path: string, download?: string) {
  const tab = download ? null : window.open('', '_blank')
  try {
    const url = URL.createObjectURL(await apiBlob(path))
    if (download) {
      const link = document.createElement('a')
      link.href = url
      link.download = download
      link.click()
    } else if (tab) {
      tab.location.href = url
    } else {
      window.location.href = url
    }
    setTimeout(() => URL.revokeObjectURL(url), 60_000)
  } catch (error) {
    tab?.close()
    throw error
  }
}
