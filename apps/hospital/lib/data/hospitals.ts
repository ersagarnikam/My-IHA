import { createClient } from '@iha/db/server'
import { createLogger } from '@iha/logger'

const logger = createLogger('hospital:data:hospitals')

export type HospitalOption = {
  id: string
  name: string
  city: string
  country: string
}

export type HospitalOptionWithRoomTypes = HospitalOption & { room_types: string[] }

export type HospitalLetterheadInfo = {
  name: string
  address: string | null
  city: string
  country: string
  zip_code: string | null
  phone: string | null
  contact_email: string | null
}

/** Full account row for the hospital admin's own hospital — used to fill in
 * letterhead details (address) when generating case letters. `hospitalId` is
 * the same id as `account.id` from `getAccountForUser` for a hospital-role
 * account. */
export async function fetchHospitalById(hospitalId: string): Promise<HospitalLetterheadInfo | null> {
  const supabase = await createClient()
  const { data, error } = await supabase
    .from('hospitals')
    .select('name, address, city, country, zip_code, phone, contact_email')
    .eq('id', hospitalId)
    .maybeSingle()

  if (error) {
    logger.error({ err: error, hospitalId }, 'fetchHospitalById query failed')
    return null
  }

  return data ?? null
}

/** Public hospital catalog, for the doctor registration wizard's affiliation picker. */
export async function fetchHospitalOptions(): Promise<HospitalOption[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('hospitals')
    .select('id, name, city, country')
    .order('name', { ascending: true })

  return data ?? []
}

/**
 * Hospitals this doctor is affiliated with (set during doctor registration,
 * see doctor-hospital-step.tsx) — the treatment-plan builder's Select
 * Hospital dropdown is scoped to these, not the full catalog.
 */
export async function fetchHospitalOptionsForDoctor(doctorId: string): Promise<HospitalOptionWithRoomTypes[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('doctor_hospital_affiliations')
    .select('hospitals(id, name, city, country, room_types, status)')
    .eq('doctor_id', doctorId)

  const rows = (data ?? []) as unknown as Array<{
    hospitals: (HospitalOptionWithRoomTypes & { status: string }) | null
  }>

  return rows
    .map((r) => r.hospitals)
    .filter((h): h is HospitalOptionWithRoomTypes & { status: string } => h !== null && h.status === 'approved')
    .map(({ status: _status, ...h }) => h)
    .sort((a, b) => a.name.localeCompare(b.name))
}
