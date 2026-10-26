import { createContext, useContext, type ReactNode } from 'react'
import { Navigate, Outlet, useLocation } from 'react-router'
import { ErrorState, Loading } from '../../components/ui'
import { setProviderTimeZone } from '../../lib/format'
import { useApi } from '../../lib/useApi'
import type { LawyerAccount, LawyerProfile } from './types'

type LawyerContextValue = {
  account: LawyerAccount
  reload: () => Promise<void>
  setAccount: (account: LawyerAccount) => void
}

const LawyerContext = createContext<LawyerContextValue | null>(null)

/** Loads the signed-in lawyer's registration once for the whole lawyer area. */
export function LawyerProvider({ children }: { children: ReactNode }) {
  const account = useApi<LawyerAccount>('/api/lawyer/account')
  if (account.error) return <ErrorState error={account.error} onRetry={account.reload} />
  if (!account.data) return <Loading />
  setProviderTimeZone(account.data.lawyer?.timeZone)
  return (
    <LawyerContext.Provider
      value={{ account: account.data, reload: account.reload, setAccount: account.setData }}
    >
      {children}
    </LawyerContext.Provider>
  )
}

export function useLawyerAccount() {
  const context = useContext(LawyerContext)
  if (!context) throw new Error('useLawyerAccount must be used inside <LawyerProvider>')
  return context
}

/** For pages behind the gate, where the lawyer is known to be registered and approved. */
export function useLawyer(): LawyerProfile & { update: (h: LawyerProfile) => void } {
  const { account, setAccount } = useLawyerAccount()
  return { ...account.lawyer!, update: (lawyer) => setAccount({ registered: true, lawyer }) }
}

/** Where the lawyer should be, given how far their registration has got (old dashboard layout gate). */
export function lawyerGatePath(account: LawyerAccount) {
  if (!account.registered || !account.lawyer) return '/lawyer/register'
  if (account.lawyer.status !== 'approved') return '/lawyer/pending-approval'
  return null
}

/** Keeps unregistered or unapproved lawyers on their gate page. */
export function RequireApprovedLawyer() {
  const { account } = useLawyerAccount()
  const location = useLocation()
  const target = lawyerGatePath(account)
  if (target && target !== location.pathname) return <Navigate to={target} replace />
  return <Outlet />
}

/** Each gate page only makes sense at its own step; anyone else goes where they belong. */
export function LawyerGateStep({ path, children }: { path: string; children: ReactNode }) {
  const { account } = useLawyerAccount()
  const target = lawyerGatePath(account) ?? '/lawyer/dashboard'
  if (target !== path) return <Navigate to={target} replace />
  return <>{children}</>
}
