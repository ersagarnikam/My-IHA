import { createClient } from '@iha/db/server'
import type { UploadedFileMeta } from '@/lib/validations/file-meta'
import type { DoctorRegistrationInput } from '@/lib/validations/doctor-registration'

export async function fetchDoctorRegistrationDetails(
  userId: string,
): Promise<{ id: string; values: DoctorRegistrationInput } | null> {
  const supabase = await createClient()
  const { data } = await supabase
    .from('doctors')
    .select(
      'id, full_name, specialties, qualifications, years_experience, bio, photo_url, languages_spoken, license_number, contact_phone, department, role, working_days, certificates',
    )
    .eq('user_id', userId)
    .maybeSingle()

  if (!data) return null

  const { data: affiliations } = await supabase
    .from('doctor_hospital_affiliations')
    .select('hospital_id')
    .eq('doctor_id', data.id)

  const certificates = (data.certificates ?? []) as UploadedFileMeta[]

  return {
    id: data.id,
    values: {
      fullName: data.full_name ?? '',
      specialties: data.specialties ?? [],
      qualifications: data.qualifications ?? '',
      yearsOfExperience: data.years_experience ?? 0,
      bio: data.bio ?? '',
      profilePhoto: data.photo_url
        ? { fileName: 'profile-photo', filePath: data.photo_url, mimeType: 'image/jpeg', fileSizeBytes: 0 }
        : null,
      languagesSpoken: data.languages_spoken ?? [],
      hospitalAffiliations: (affiliations ?? []).map((a) => a.hospital_id),
      licenseNumber: data.license_number ?? '',
      contactPhone: data.contact_phone ?? '',
      department: data.department ?? '',
      role: (data.role ?? undefined) as DoctorRegistrationInput['role'],
      workingDays: (data.working_days ?? []) as DoctorRegistrationInput['workingDays'],
      certificates,
    },
  }
}
