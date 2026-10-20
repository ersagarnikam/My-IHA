import { fetchPatientByUserId } from './patients'
import {
  fetchPatientCases,
  fetchCaseById,
  fetchDocumentsByCase,
  fetchAllDocumentsForPatient,
  type DocumentWithCaseInfo,
} from '@iha/db/cases'
import { getAuthUser } from '@iha/db/server'
import type { Case, CaseDocument } from '@iha/db/types'

export type DocumentWithCase = DocumentWithCaseInfo & { origin: 'case_documents' | 'visa_documents' }

async function getPatientIdForUser(userId: string): Promise<string | null> {
  const patient = await fetchPatientByUserId(userId)
  return patient?.id ?? null
}

export async function fetchCasesForPatientId(patientId: string): Promise<Case[]> {
  const { data } = await fetchPatientCases(patientId)
  return data ?? []
}

export async function fetchCasesForCurrentUser(): Promise<Case[]> {
  const user = await getAuthUser()
  if (!user) return []

  const patientId = await getPatientIdForUser(user.id)
  if (!patientId) return []

  return fetchCasesForPatientId(patientId)
}

export async function fetchCaseForCurrentUser(
  caseId: string,
): Promise<Case | null> {
  const { data } = await fetchCaseById(caseId)
  // RLS ensures this belongs to the current user — null = not found or not theirs
  return data ?? null
}

export async function fetchCaseDocumentsForCase(
  caseId: string,
): Promise<CaseDocument[]> {
  const { data } = await fetchDocumentsByCase(caseId)
  return data ?? []
}

export async function fetchAllDocumentsForPatientId(patientId: string): Promise<DocumentWithCase[]> {
  const { data } = await fetchAllDocumentsForPatient(patientId)
  return data.map((doc) => ({ ...doc, origin: 'case_documents' as const }))
}
