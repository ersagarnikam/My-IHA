import { createContext, useContext, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { ErrorState, Loading } from '../../components/ui'
import { useApi } from '../../lib/useApi'
import type { DoctorAccount, DoctorProfile } from './types'

type DoctorContextValue = {
  account: DoctorAccount
  reload: () => Promise<void>
  setAccount: (account: DoctorAccount) => void
}

const DoctorContext = createContext<DoctorContextValue | null>(null)

/** Loads the signed-in doctor's registration once for the whole doctor area. */
export function DoctorProvider({ children }: { children: ReactNode }) {
  const account = useApi<DoctorAccount>('/api/doctor/account')
  if (account.error) return <ErrorState error={account.error} onRetry={account.reload} />
  if (!account.data) return <Loading />
  return (
    <DoctorContext.Provider
      value={{ account: account.data, reload: account.reload, setAccount: account.setData }}
    >
      {children}
    </DoctorContext.Provider>
  )
}

export function useDoctorAccount() {
  const context = useContext(DoctorContext)
  if (!context) throw new Error('useDoctorAccount must be used inside <DoctorProvider>')
  return context
}

/** For pages behind the gate, where the doctor is known to be registered and active. */
export function useDoctor(): DoctorProfile & { reload: () => Promise<void>; update: (d: DoctorProfile) => void } {
  const { account, reload, setAccount } = useDoctorAccount()
  return {
    ...account.doctor!,
    reload,
    update: (doctor) => setAccount({ registered: true, doctor }),
  }
}

/** Where the doctor should be, given how far their registration has got (old dashboard layout gate). */
export function gatePath(account: DoctorAccount) {
  if (!account.registered || !account.doctor) return '/doctor/register'
  if (account.doctor.status !== 'approved') return '/doctor/pending-approval'
  if (!account.doctor.registrationFeePaidAt) return '/doctor/registration-fee'
  return null
}

/** Keeps unregistered, unapproved or unpaid doctors on their gate page. */
export function RequireActiveDoctor() {
  const { account } = useDoctorAccount()
  const location = useLocation()
  const target = gatePath(account)
  if (target && target !== location.pathname) return <Navigate to={target} replace />
  return <Outlet />
}

/** Each gate page only makes sense at its own step; anyone else goes where they belong. */
export function GateStep({ path, children }: { path: string; children: ReactNode }) {
  const { account } = useDoctorAccount()
  const target = gatePath(account) ?? '/doctor/dashboard'
  if (target !== path) return <Navigate to={target} replace />
  return <>{children}</>
}
