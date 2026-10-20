import Image from 'next/image'
import Link from 'next/link'
import { redirect, notFound } from 'next/navigation'
import { ArrowLeft, Globe2 } from 'lucide-react'
import { createClient } from '@iha/db/server'
import { Card, CardContent, CardHeader, CardTitle, CaseStatusBadge } from '@iha/ui'
import { getAccountForUser } from '@/lib/auth/account'
import { fetchPatientDetailForHospital, fetchCasesForHospitalPatient } from '@/lib/data/patient-management'

function formatDate(iso: string | null) {
  if (!iso) return null
  return new Date(iso).toLocaleDateString('en-AU', { day: 'numeric', month: 'short', year: 'numeric' })
}

function Field({ label, value }: { label: string; value: string | null | undefined }) {
  return (
    <div>
      <dt className="text-xs font-medium text-slate-500">{label}</dt>
      <dd className="mt-0.5 whitespace-pre-wrap text-sm text-slate-900">{value || '—'}</dd>
    </div>
  )
}

export default async function PatientDetailPage({
  params,
}: {
  params: Promise<{ patientId: string }>
}) {
  const { patientId } = await params

  const supabase = await createClient()
  const {
    data: { user },
  } = await supabase.auth.getUser()
  if (!user) redirect('/login')

  const account = await getAccountForUser(user.id)
  if (!account) redirect('/register')
  if (account.role !== 'hospital') redirect('/dashboard')

  const [{ data: patient }, { data: cases }] = await Promise.all([
    fetchPatientDetailForHospital(patientId),
    fetchCasesForHospitalPatient(patientId, account.id),
  ])

  if (!patient) notFound()

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <Link
          href="/patient-management"
          aria-label="Back to Patient Management"
          className="grid h-9 w-9 shrink-0 place-items-center rounded-full bg-slate-100 text-slate-600 hover:bg-slate-200"
        >
          <ArrowLeft className="h-4 w-4" />
        </Link>
        <h1 className="text-lg font-semibold text-slate-900">Patient Details</h1>
      </div>

      <Card>
        <CardContent className="flex items-center gap-3 p-4">
          {patient.avatarUrl ? (
            <Image
              src={patient.avatarUrl}
              alt={patient.fullName}
              width={48}
              height={48}
              className="h-12 w-12 rounded-full object-cover"
            />
          ) : (
            <div className="grid h-12 w-12 shrink-0 place-items-center rounded-full bg-cyan-100 text-base font-semibold text-cyan-800">
              {patient.fullName.charAt(0).toUpperCase()}
            </div>
          )}
          <p className="text-sm font-semibold text-slate-900">{patient.fullName}</p>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Personal Details</CardTitle>
        </CardHeader>
        <CardContent>
          <dl className="grid grid-cols-2 gap-x-6 gap-y-4 sm:grid-cols-3">
            <Field label="Date of Birth" value={formatDate(patient.dateOfBirth)} />
            <Field label="Gender" value={patient.gender} />
            <div className="flex flex-col">
              <dt className="flex items-center gap-1 text-xs font-medium text-slate-500">
                <Globe2 className="h-3 w-3" />
                Country
              </dt>
              <dd className="mt-0.5 text-sm text-slate-900">{patient.countryOfResidence || '—'}</dd>
            </div>
          </dl>
        </CardContent>
      </Card>

      {(patient.medicalHistory ||
        patient.allergies.length > 0 ||
        patient.currentMedications.length > 0 ||
        patient.pastSurgeries) && (
        <Card>
          <CardHeader>
            <CardTitle className="text-base">Medical History</CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {patient.medicalHistory && (
              <p className="whitespace-pre-wrap text-sm text-slate-600">{patient.medicalHistory}</p>
            )}
            <dl className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field label="Allergies" value={patient.allergies.join(', ')} />
              <Field label="Current Medications" value={patient.currentMedications.join(', ')} />
              <Field label="Past Surgeries" value={patient.pastSurgeries} />
            </dl>
          </CardContent>
        </Card>
      )}

      <Card>
        <CardHeader>
          <CardTitle className="text-base">Cases</CardTitle>
        </CardHeader>
        <CardContent>
          {cases.length === 0 ? (
            <p className="py-4 text-center text-sm text-slate-500">No cases for this patient.</p>
          ) : (
            <div className="divide-y divide-slate-100">
              {cases.map((c) => (
                <div key={c.id} className="flex items-center justify-between gap-4 py-3">
                  <div>
                    <Link
                      href={`/case-management/${c.id}`}
                      className="text-sm font-medium text-cyan-700 hover:underline"
                    >
                      {c.referenceNumber}
                    </Link>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {[c.specialtyOther ?? c.specialty, c.doctorName].filter(Boolean).join(' · ')}
                    </p>
                  </div>
                  <CaseStatusBadge status={c.status} />
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  )
}
