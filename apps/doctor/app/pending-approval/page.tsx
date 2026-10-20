import { redirect } from 'next/navigation'
import { createClient } from '@iha/db/server'
import { fetchActiveSpecialties } from '@iha/db/specialties'
import { getAccountForUser } from '@/lib/auth/account'
import { fetchHospitalOptions } from '@/lib/data/hospitals'
import { fetchDoctorRegistrationDetails } from '@/lib/data/registration-details'
import { DoctorResubmitForm } from '@/components/registration/doctor-resubmit-form'
import { signOut } from '@/lib/actions/auth'

const STATUS_COPY = {
  pending: {
    title: 'Your registration is under review',
    body: "Thanks for registering with MTA. Our admin team is reviewing your submission — you'll receive an email as soon as it's approved.",
  },
  more_info_requested: {
    title: 'More information needed',
    body: 'MTA Admin has requested more information before your registration can be approved. Please review the note below and resubmit.',
  },
  rejected: {
    title: 'Registration not approved',
    body: 'Your registration was not approved. Please review the reason below, make any necessary changes, and resubmit.',
  },
} as const

export default async function PendingApprovalPage() {
  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()

  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')
  if (account.status === 'approved') redirect('/dashboard')

  const copy = STATUS_COPY[account.status]
  const canResubmit = account.status === 'rejected' || account.status === 'more_info_requested'
  const note = account.status === 'rejected' ? account.rejectionReason : account.moreInfoMessage

  let resubmitForm: React.ReactNode = null
  if (canResubmit) {
    const [details, { data: specialties }, hospitalOptions] = await Promise.all([
      fetchDoctorRegistrationDetails(user.id),
      fetchActiveSpecialties(),
      fetchHospitalOptions(),
    ])
    if (details) {
      resubmitForm = (
        <DoctorResubmitForm
          doctorId={details.id}
          userId={user.id}
          defaultValues={details.values}
          specialties={specialties}
          hospitalOptions={hospitalOptions}
        />
      )
    }
  }

  return (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <h1 className="text-2xl font-bold text-foreground">{copy.title}</h1>
        <p className="text-sm text-muted-foreground">{copy.body}</p>
        {note && (
          <p className="rounded-md bg-amber-50 px-4 py-3 text-left text-sm text-amber-800">{note}</p>
        )}
      </div>

      {resubmitForm}

      <form action={signOut} className="text-center">
        <button type="submit" className="text-sm text-muted-foreground hover:underline">
          Log out
        </button>
      </form>
    </div>
  )
}
