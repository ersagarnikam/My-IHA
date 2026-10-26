import { createContext, useContext, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { ErrorState, Loading } from '../../components/ui'
import { setProviderTimeZone } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import type { HospitalAccount, HospitalProfile } from './types'

type HospitalContextValue = {
  account: HospitalAccount
  reload: () => Promise<void>
  setAccount: (account: HospitalAccount) => void
}

const HospitalContext = createContext<HospitalContextValue | null>(null)

/** Loads the signed-in hospital's registration once for the whole hospital area. */
export function HospitalProvider({ children }: { children: ReactNode }) {
  const account = useApi<HospitalAccount>('/api/hospital/account')
  if (account.error) return <ErrorState error={account.error} onRetry={account.reload} />
  if (!account.data) return <Loading />
  setProviderTimeZone(account.data.hospital?.timeZone)
  return (
    <HospitalContext.Provider
      value={{ account: account.data, reload: account.reload, setAccount: account.setData }}
    >
      {children}
    </HospitalContext.Provider>
  )
}

export function useHospitalAccount() {
  const context = useContext(HospitalContext)
  if (!context) throw new Error('useHospitalAccount must be used inside <HospitalProvider>')
  return context
}

/** For pages behind the gate, where the hospital is known to be registered and approved. */
export function useHospital(): HospitalProfile & { update: (h: HospitalProfile) => void } {
  const { account, setAccount } = useHospitalAccount()
  return { ...account.hospital!, update: (hospital) => setAccount({ registered: true, hospital }) }
}

/** Where the hospital should be, given how far its registration has got (old dashboard layout gate). */
export function hospitalGatePath(account: HospitalAccount) {
  if (!account.registered || !account.hospital) return '/hospital/register'
  if (account.hospital.status !== 'approved') return '/hospital/pending-approval'
  return null
}

/** Keeps unregistered or unapproved hospitals on their gate page. */
export function RequireApprovedHospital() {
  const { account } = useHospitalAccount()
  const location = useLocation()
  const target = hospitalGatePath(account)
  if (target && target !== location.pathname) return <Navigate to={target} replace />
  return <Outlet />
}

/** Each gate page only makes sense at its own step; anyone else goes where they belong. */
export function HospitalGateStep({ path, children }: { path: string; children: ReactNode }) {
  const { account } = useHospitalAccount()
  const target = hospitalGatePath(account) ?? '/hospital/dashboard'
  if (target !== path) return <Navigate to={target} replace />
  return <>{children}</>
}
