import { getAuthUser } from '@iha/db/server'
import {
  fetchTreatmentOptionsForCase,
  fetchAllTreatmentOptionsForPatient,
} from '@iha/db/treatments'
import type { TreatmentOptionWithDetails, TreatmentOptionWithCaseInfo } from '@iha/db/treatments'
import { fetchPatientByUserId } from './patients'

export type { TreatmentOptionWithDetails, TreatmentOptionWithCaseInfo }

export async function fetchTreatmentOptionsForCurrentCase(
  caseId: string,
): Promise<TreatmentOptionWithDetails[]> {
  const { data, error } = await fetchTreatmentOptionsForCase(caseId)
  if (error) console.error('fetchTreatmentOptionsForCase error:', error)
  return data
}

export async function fetchAllTreatmentOptionsForCurrentUser(): Promise<TreatmentOptionWithCaseInfo[]> {
  const user = await getAuthUser()
  if (!user) return []

  const patient = await fetchPatientByUserId(user.id)
  if (!patient) return []

  const { data } = await fetchAllTreatmentOptionsForPatient(patient.id)
  return data
}
