import { createClient } from '@iha/db/server'
import type { HospitalDoctorStatus } from '@/types'

export type Account =
  | {
      role: 'hospital'
      id: string
      displayName: string
      status: HospitalDoctorStatus
      rejectionReason: string | null
      moreInfoMessage: string | null
    }
  | {
      role: 'doctor'
      id: string
      displayName: string
      status: HospitalDoctorStatus
      rejectionReason: string | null
      moreInfoMessage: string | null
      registrationFeePaidAt: string | null
      annualFeeNextDueAt: string | null
    }

/**
 * A signed-in user maps to exactly one hospitals row or one doctors row,
 * never both — this is the single lookup both login redirect and dashboard
 * gating use to find out which, and what its approval status is.
 */
export async function getAccountForUser(userId: string): Promise<Account | null> {
  const supabase = await createClient()

  const { data: hospital } = await supabase
    .from('hospitals')
    .select('id, name, status, rejection_reason, more_info_message')
    .eq('user_id', userId)
    .maybeSingle()

  if (hospital) {
    return {
      role: 'hospital',
      id: hospital.id,
      displayName: hospital.name,
      status: hospital.status as HospitalDoctorStatus,
      rejectionReason: hospital.rejection_reason,
      moreInfoMessage: hospital.more_info_message,
    }
  }

  const { data: doctor } = await supabase
    .from('doctors')
    .select(
      'id, full_name, status, rejection_reason, more_info_message, registration_fee_paid_at, annual_fee_next_due_at',
    )
    .eq('user_id', userId)
    .maybeSingle()

  if (doctor) {
    return {
      role: 'doctor',
      id: doctor.id,
      displayName: doctor.full_name,
      status: doctor.status as HospitalDoctorStatus,
      rejectionReason: doctor.rejection_reason,
      moreInfoMessage: doctor.more_info_message,
      registrationFeePaidAt: doctor.registration_fee_paid_at,
      annualFeeNextDueAt: doctor.annual_fee_next_due_at,
    }
  }

  return null
}
