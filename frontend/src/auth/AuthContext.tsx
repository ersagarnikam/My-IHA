import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react'
import {
  apiPost,
  loadSession,
  saveSession,
  setUnauthorizedHandler,
  type Role,
  type Session,
  type SessionUser,
} from '../lib/api'
import { drafts } from '../lib/format'
import { goHome } from '../lib/site'

type AuthContextValue = {
  user: SessionUser | null
  login: (email: string, password: string) => Promise<SessionUser>
  verify: (email: string, code: string) => Promise<SessionUser>
  /** Drops the session (e.g. it expired); route guards then send the user to /login. */
  logout: () => void
  /** The user chose to leave: clears session and wizard drafts, returns to the public website. */
  signOut: () => void
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [session, setSession] = useState<Session | null>(() => loadSession())

  const apply = useCallback((next: Session | null) => {
    saveSession(next)
    setSession(next)
  }, [])

  useEffect(() => {
    setUnauthorizedHandler(() => apply(null))
  }, [apply])

  const value = useMemo<AuthContextValue>(
    () => ({
      user: session?.user ?? null,
      login: async (email, password) => {
        const next = await apiPost<Session>('/api/auth/login', { email, password })
        apply(next)
        return next.user
      },
      verify: async (email, code) => {
        const next = await apiPost<Session>('/api/auth/verify', { email, code })
        apply(next)
        return next.user
      },
      logout: () => apply(null),
      signOut: () => {
        drafts.clearAll()
        apply(null)
        goHome(true)
      },
    }),
    [session, apply],
  )

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>
}

export function useAuth() {
  const context = useContext(AuthContext)
  if (!context) throw new Error('useAuth must be used inside <AuthProvider>')
  return context
}

/** Each role has its own area of the app, like the old one-portal-per-role split. */
export const ROLE_HOME: Record<Role, string> = {
  PATIENT: '/patient/dashboard',
  DOCTOR: '/doctor/dashboard',
  HOSPITAL: '/hospital',
  LAWYER: '/lawyer',
  ADMIN: '/admin/dashboard',
}
