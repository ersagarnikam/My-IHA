import Image from 'next/image'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { createClient } from '@iha/db/server'
import { Card, CardContent, CardHeader, CardTitle } from '@iha/ui'
import { getAccountForUser } from '@/lib/auth/account'
import { fetchAffiliatedDoctorDetail, fetchDoctorCaseStatsForHospital } from '@/lib/data/doctor-management'
import { DoctorStatusBadge } from '@/components/doctor-management/doctor-status-badge'
import { doctorRoleLabels, doctorRoles } from '@/lib/validations/doctor-registration'
import { doctorGenderLabels, doctorGenders, availabilityDayLabels } from '@/lib/validations/account-settings'

const TIME_LABELS: Record<string, string> = Object.fromEntries(
  Array.from({ length: 48 }, (_, i) => {
    const hour24 = Math.floor(i / 2)
    const minute = i % 2 === 0 ? '00' : '30'
    const period = hour24 < 12 ? 'AM' : 'PM'
    const hour12 = hour24 % 12 === 0 ? 12 : hour24 % 12
    const value = `${String(hour24).padStart(2, '0')}:${minute}`
    const label = `${String(hour12).padStart(2, '0')}:${minute} ${period}`
    return [value, label]
  }),
)

function formatTime(value: string) {
  return TIME_LABELS[value] ?? value
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-900">{value || '—'}</dd>
    </div>
  )
}

export default async function DoctorDetailPage({
  params,
}: {
  params: Promise<{ doctorId: string }>
}) {
  const { doctorId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')
  if (account.role !== 'hospital') redirect('/dashboard')

  const { data: doctor } = await fetchAffiliatedDoctorDetail(account.id, doctorId)
  if (!doctor) notFound()

  const stats = await fetchDoctorCaseStatsForHospital(doctor.id)

  const genderLabel = doctor.gender
    ? doctorGenderLabels[doctor.gender as (typeof doctorGenders)[number]]
    : null
  const roleLabel = doctor.role ? doctorRoleLabels[doctor.role as (typeof doctorRoles)[number]] : null

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Link
            href="/doctor-management"
            aria-label="Back to Doctor Management"
            className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
          >
            <ArrowLeft className="h-4 w-4" />
          </Link>
          <h1 className="text-lg font-semibold text-slate-900">Doctor Details</h1>
        </div>
        <DoctorStatusBadge status={doctor.status} />
      </div>

      <Card>
        <CardContent className="flex flex-wrap items-center gap-4 p-4">
          <div className="flex flex-wrap items-center gap-4 sm:divide-x sm:divide-slate-200">
            <div className="flex items-center gap-3 sm:pr-6">
              {doctor.photoUrl ? (
                <Image
                  src={doctor.photoUrl}
                  alt={doctor.fullName}
                  width={48}
                  height={48}
                  className="h-12 w-12 shrink-0 rounded-full object-cover"
                />
              ) : (
                <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-cyan-100 text-base font-semibold text-cyan-800">
                  {doctor.fullName.charAt(0).toUpperCase()}
                </div>
              )}
              <div>
                <p className="text-sm font-semibold text-slate-900">{doctor.fullName}</p>
                <p className="text-xs text-slate-500">
                  {[doctor.department, roleLabel].filter(Boolean).join(' · ') || '—'}
                </p>
              </div>
            </div>

            <div className="flex flex-wrap gap-6 sm:pl-6">
              <div>
                <p className="text-xs font-medium text-slate-500">Total Cases</p>
                <p className="mt-0.5 text-lg font-semibold text-slate-900">{stats.totalCases}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Active</p>
                <p className="mt-0.5 text-lg font-semibold text-slate-900">{stats.activeCases}</p>
              </div>
              <div>
                <p className="text-xs font-medium text-slate-500">Completed</p>
                <p className="mt-0.5 text-lg font-semibold text-slate-900">{stats.completedCases}</p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Field label="Full Name" value={doctor.fullName} />
            <Field label="Email" value={doctor.contactEmail} />
            <Field label="Phone Number" value={doctor.contactPhone} />
            <Field label="Date of Birth" value={doctor.dateOfBirth} />
            <Field label="Gender" value={genderLabel} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Professional Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Field label="Specialization" value={doctor.specialties.join(', ')} />
            <Field label="Qualification" value={doctor.qualifications} />
            <Field
              label="Experience"
              value={doctor.yearsOfExperience != null ? `${doctor.yearsOfExperience} yrs` : null}
            />
            <Field label="License Number" value={doctor.licenseNumber} />
            <Field label="Department" value={doctor.department} />
            <Field label="Role" value={roleLabel} />
            <div className="col-span-2 sm:col-span-3">
              <Field
                label="Hospital Affiliations"
                value={doctor.hospitalAffiliations.map((h) => h.name).join(', ')}
              />
            </div>
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Additional Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-1 gap-y-4">
            <Field label="Languages Spoken" value={doctor.languagesSpoken.join(', ')} />
            <Field label="Bio" value={doctor.bio} />
          </dl>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Schedule</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="divide-y divide-slate-100">
            {doctor.availabilitySchedule.map((day) => (
              <div key={day.day} className="flex items-center justify-between gap-4 py-3">
                <span className="text-sm font-medium text-slate-900">{availabilityDayLabels[day.day]}</span>
                {day.enabled ? (
                  <span className="text-sm text-slate-600">
                    {formatTime(day.start_time)} – {formatTime(day.end_time)}
                  </span>
                ) : (
                  <span className="text-sm text-slate-400">Not Available</span>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  )
}
