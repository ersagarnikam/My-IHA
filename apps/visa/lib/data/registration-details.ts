import { createClient } from '@iha/db/server'
import type { LawyerRegistrationInput } from '@/lib/validations/lawyer-registration'

export async function fetchLawyerRegistrationDetails(
  userId: string,
): Promise<{ id: string; values: LawyerRegistrationInput } | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('lawyers')
    .select(
      'id, name, lawyer_type, registration_number, abn_number, immigration_law_certification, contact_phone, address, city, zip_code, certificates',
    )
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return null

  return {
    id: data.id,
    values: {
      name: data.name ?? '',
      lawyerType: data.lawyer_type as LawyerRegistrationInput['lawyerType'],
      registrationNumber: data.registration_number ?? '',
      abnNumber: data.abn_number ?? '',
      immigrationLawCertification: data.immigration_law_certification ?? '',
      phone: data.contact_phone ?? '',
      address: data.address ?? '',
      city: data.city ?? '',
      zipCode: data.zip_code ?? '',
      certificates: (data.certificates ?? []) as LawyerRegistrationInput['certificates'],
    },
  }
}
