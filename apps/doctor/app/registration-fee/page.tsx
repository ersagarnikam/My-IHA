import { redirect } from 'next/navigation'
import { createClient, getAuthUser } from '@iha/db/server'
import { fetchFeeSettings } from '@iha/db/doctor-fees'
import { getAccountForUser } from '@/lib/auth/account'
import { RegistrationFeePaymentClient } from '@/components/registration-fee/registration-fee-payment-client'

export default async function RegistrationFeePage({
  searchParams,
}: {
  searchParams: Promise<{ redirect_status?: string }>
}) {
  const { redirect_status } = await searchParams

  const user = await getAuthUser()
  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')
  if (account.role !== 'doctor') {
    const supabase = await createClient()
    await supabase.auth.signOut()
    redirect('/login')
  }
  if (account.status !== 'approved') redirect('/pending-approval')
  if (account.registrationFeePaidAt) redirect('/dashboard')

  const { data: feeSettings, error } = await fetchFeeSettings()
  if (error || !feeSettings) {
    return (
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold text-foreground">Registration fee unavailable</h1>
        <p className="text-sm text-muted-foreground">
          We couldn&apos;t load the registration fee amount. Please try again shortly or contact support.
        </p>
      </div>
    )
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold text-foreground">You&apos;re approved — one last step</h1>
        <p className="text-sm text-muted-foreground">
          Pay the one-time registration fee of ${feeSettings.doctorRegistrationFeeAud.toFixed(2)} AUD to activate
          your dashboard. Your first annual renewal fee of ${feeSettings.doctorAnnualFeeAud.toFixed(2)} AUD
          won&apos;t be due for a year.
        </p>
      </div>

      <RegistrationFeePaymentClient
        amountAud={feeSettings.doctorRegistrationFeeAud}
        redirectStatus={redirect_status ?? null}
        reference={`DOC-REG-${account.id.slice(0, 8).toUpperCase()}`}
      />
    </div>
  )
}
