import { createContext, useContext, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation, useOutletContext } from 'react-router'
import { ErrorState, Loading } from '../../components/ui'
import type { Specialty } from '../../lib/cases'
import { apiGet } from '../../lib/api'
import type { Profile } from '../../lib/types'
import { useApi } from '../../lib/useApi'

type PatientContextValue = {
  profile: Profile
  reloadProfile: () => Promise<void>
  specialties: Specialty[]
}

const PatientContext = createContext<PatientContextValue | null>(null)

/** Loads the profile and specialty list once for every patient page. */
export function PatientProvider({ children }: { children: ReactNode }) {
  const profile = useApi<Profile>('/api/patient/profile')
  const specialties = useApi<Specialty[]>('/api/specialties')

  if (profile.error) return <ErrorState error={profile.error} onRetry={profile.reload} />
  if (!profile.data || !specialties.data) return <Loading />

  const value: PatientContextValue = {
    profile: profile.data,
    reloadProfile: async () => profile.setData(await apiGet<Profile>('/api/patient/profile')),
    specialties: specialties.data,
  }
  return <PatientContext.Provider value={value}>{children}</PatientContext.Provider>
}

export function usePatient() {
  const context = useContext(PatientContext)
  if (!context) throw new Error('usePatient must be used inside <PatientProvider>')
  return context
}

/** The old dashboard-layout gate: onboarding (DOB + emergency contact) must be finished first. */
export function RequireCompleteProfile() {
  const { profile } = usePatient()
  const location = useLocation()
  // Forward the layout's outlet context (chat unread refresh) to the pages below.
  const context = useOutletContext()
  if (!profile.profileComplete)
    return <Navigate to="/patient/profile/setup" replace state={{ from: location.pathname }} />
  return <Outlet context={context} />
}
