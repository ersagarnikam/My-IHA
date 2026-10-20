import { createClient } from '@iha/db/server'
import type { HospitalRegistrationInput } from '@/lib/validations/hospital-registration'

export async function fetchHospitalRegistrationDetails(
  userId: string,
): Promise<{ id: string; values: HospitalRegistrationInput } | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('hospitals')
    .select(
      'id, name, registration_type, registration_number, abn_number, address, zip_code, city, country, phone, specialties, bed_count, room_types, license_number, accreditation_body, certificates',
    )
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return null

  return {
    id: data.id,
    values: {
      name: data.name ?? '',
      registrationType: data.registration_type as HospitalRegistrationInput['registrationType'],
      registrationNumber: data.registration_number ?? '',
      abnNumber: data.abn_number ?? '',
      address: data.address ?? '',
      zipCode: data.zip_code ?? '',
      city: data.city ?? '',
      country: data.country ?? '',
      phone: data.phone ?? '',
      specialties: data.specialties ?? [],
      bedCount: data.bed_count ?? 0,
      roomTypes: data.room_types ?? [],
      licenseNumber: data.license_number ?? '',
      accreditationBody: data.accreditation_body ?? '',
      certificates: (data.certificates ?? []) as HospitalRegistrationInput['certificates'],
    },
  }
}
