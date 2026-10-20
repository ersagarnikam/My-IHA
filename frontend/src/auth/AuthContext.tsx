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

type AuthContextValue = {
  user: SessionUser | null
  login: (email: string, password: string) => Promise<SessionUser>
  verify: (email: string, code: string) => Promise<SessionUser>
  logout: () => void
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
  DOCTOR: '/doctor',
  HOSPITAL: '/hospital',
  LAWYER: '/lawyer',
  ADMIN: '/admin',
}
