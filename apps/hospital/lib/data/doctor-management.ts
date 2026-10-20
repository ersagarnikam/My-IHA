import { createClient } from '@iha/db/server'
import { createLogger } from '@iha/logger'
import { deriveAvailabilityFromWorkingDays } from './account-settings'
import type { AvailabilityDay } from '@/lib/validations/account-settings'

const logger = createLogger('hospital:data:doctor-management')

export type AffiliatedDoctor = {
  id: string
  fullName: string
  specialties: string[]
  department: string | null
  role: string | null
  status: string
  contactEmail: string | null
  contactPhone: string | null
  photoUrl: string | null
  licenseNumber: string | null
  yearsOfExperience: number | null
  qualifications: string | null
}

/** Doctor ids affiliated with this hospital — the scoping filter shared by
 * Doctor/Patient/Case Management. `doctor_hospital_affiliations` grants
 * blanket authenticated SELECT (see 20260714112707), so this is a plain read. */
export async function fetchAffiliatedDoctorIds(hospitalId: string): Promise<string[]> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('doctor_hospital_affiliations')
    .select('doctor_id')
    .eq('hospital_id', hospitalId)

  return (data ?? []).map((r) => r.doctor_id)
}

export async function fetchAffiliatedDoctors(
  hospitalId: string,
): Promise<{ data: AffiliatedDoctor[]; error: string | null }> {
  const doctorIds = await fetchAffiliatedDoctorIds(hospitalId)
  if (doctorIds.length === 0) return { data: [], error: null }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('doctors')
    .select(
      'id, full_name, specialties, department, role, status, contact_email, contact_phone, photo_url, license_number, years_experience, qualifications',
    )
    .in('id', doctorIds)
    .order('full_name', { ascending: true })

  if (error) {
    logger.error({ err: error, hospitalId }, 'fetchAffiliatedDoctors failed')
    return { data: [], error: error.message }
  }

  const doctors: AffiliatedDoctor[] = (data ?? []).map((d) => ({
    id: d.id,
    fullName: d.full_name ?? '',
    specialties: d.specialties ?? [],
    department: d.department,
    role: d.role,
    status: d.status,
    contactEmail: d.contact_email,
    contactPhone: d.contact_phone,
    photoUrl: d.photo_url,
    licenseNumber: d.license_number,
    yearsOfExperience: d.years_experience,
    qualifications: d.qualifications,
  }))

  return { data: doctors, error: null }
}

export type AffiliatedDoctorDetail = AffiliatedDoctor & {
  gender: string | null
  dateOfBirth: string | null
  bio: string | null
  languagesSpoken: string[]
  hospitalAffiliations: { id: string; name: string }[]
  availabilitySchedule: AvailabilityDay[]
}

/** Full profile for a single affiliated doctor — used by the Doctor
 * Management detail page. Re-checks the affiliation itself (rather than
 * relying solely on `doctors`' blanket-read RLS policy) so this stays scoped
 * to doctors actually affiliated with this hospital. */
export async function fetchAffiliatedDoctorDetail(
  hospitalId: string,
  doctorId: string,
): Promise<{ data: AffiliatedDoctorDetail | null; error: string | null }> {
  const doctorIds = await fetchAffiliatedDoctorIds(hospitalId)
  if (!doctorIds.includes(doctorId)) return { data: null, error: null }

  const supabase = await createClient()
  const { data, error } = await supabase
    .from('doctors')
    .select(
      'id, full_name, specialties, department, role, status, contact_email, contact_phone, photo_url, license_number, years_experience, qualifications, gender, date_of_birth, bio, languages_spoken, working_days, availability_schedule',
    )
    .eq('id', doctorId)
    .maybeSingle()

  if (error) {
    logger.error({ err: error, doctorId }, 'fetchAffiliatedDoctorDetail failed')
    return { data: null, error: error.message }
  }
  if (!data) return { data: null, error: null }

  const { data: affiliationRows } = await supabase
    .from('doctor_hospital_affiliations')
    .select('hospitals(id, name)')
    .eq('doctor_id', doctorId)

  const hospitalAffiliations = ((affiliationRows ?? []) as unknown as Array<{
    hospitals: { id: string; name: string } | null
  }>)
    .map((r) => r.hospitals)
    .filter((h): h is { id: string; name: string } => h !== null)

  return {
    data: {
      id: data.id,
      fullName: data.full_name ?? '',
      specialties: data.specialties ?? [],
      department: data.department,
      role: data.role,
      status: data.status,
      contactEmail: data.contact_email,
      contactPhone: data.contact_phone,
      photoUrl: data.photo_url,
      licenseNumber: data.license_number,
      yearsOfExperience: data.years_experience,
      qualifications: data.qualifications,
      gender: data.gender,
      dateOfBirth: data.date_of_birth,
      bio: data.bio,
      languagesSpoken: data.languages_spoken ?? [],
      hospitalAffiliations,
      availabilitySchedule:
        (data.availability_schedule as AvailabilityDay[] | null)?.length
          ? (data.availability_schedule as AvailabilityDay[])
          : deriveAvailabilityFromWorkingDays(data.working_days ?? []),
    },
    error: null,
  }
}

export type DoctorCaseStats = {
  totalCases: number
  activeCases: number
  completedCases: number
}

/** Case counts for the Doctor Details header — relies on the hospital-scoped
 * RLS policy on `doctor_case_assignments` (see 20260730060000) for the actual
 * access check, which only counts cases where this doctor has submitted a
 * treatment plan naming this hospital — not every case the doctor holds. */
export async function fetchDoctorCaseStatsForHospital(doctorId: string): Promise<DoctorCaseStats> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('doctor_case_assignments')
    .select('case_id, cases(status)')
    .eq('doctor_id', doctorId)

  const rows = (data ?? []) as unknown as Array<{ case_id: string; cases: { status: string } | null }>
  const totalCases = rows.length
  const completedCases = rows.filter((r) => r.cases?.status === 'completed').length

  return { totalCases, activeCases: totalCases - completedCases, completedCases }
}
