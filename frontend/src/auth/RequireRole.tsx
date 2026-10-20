import { Navigate, Outlet, useLocation } from 'react-router'
import type { Role } from '../lib/api'
import { ROLE_HOME, useAuth } from './AuthContext'

/** Route guard: signed-out users go to /login, other roles go to their own area. */
export function RequireRole({ role }: { role: Role }) {
  const { user } = useAuth()
  const location = useLocation()

  if (!user) return <Navigate to="/login" replace state={{ from: location.pathname }} />
  if (user.role !== role) return <Navigate to={ROLE_HOME[user.role]} replace />
  return <Outlet />
}
