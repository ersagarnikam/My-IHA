// Matches the 9 categories the patient wizard actually ships (see
// patient-portal/06-visa-documents.md) — SOW says "8 categories," this
// codebase's real one has 9. The patient app's own labels are wired through
// its i18n system, not a plain exportable map, so this is a small local copy
// rather than a shared import.
export const DOCUMENT_CATEGORY_LABELS: Record<string, string> = {
  passport: 'Passport Copy',
  passport_photograph: 'Passport Size Photograph',
  hospital_invitation: 'Hospital Invitation Letter',
  appointment_confirmation: 'Appointment Confirmation Letter',
  bank_statement: 'Bank Statement',
  sponsorship_letter: 'Sponsorship Letter',
  employer_letter: 'Employer Letter',
  companion_passport: 'Companion Passport Copy',
  companion_proof_of_relationship: 'Proof of Relationship',
  approved_visa: 'Approved Visa',
}

export function getDocumentCategoryLabel(category: string): string {
  return DOCUMENT_CATEGORY_LABELS[category] ?? category
}

// hospital_invitation and appointment_confirmation are hospital-generated
// letters (see @iha/db/visa HospitalLetterType) and approved_visa is
// lawyer-issued (see @iha/db/visa LawyerIssuedDocument) — none of these are
// ever uploaded by the patient, so they're excluded from the lawyer's
// "request a document" list.
const NON_PATIENT_UPLOADED_CATEGORIES = new Set(['hospital_invitation', 'appointment_confirmation', 'approved_visa'])

export const REQUESTABLE_DOCUMENT_CATEGORY_LABELS: Record<string, string> = Object.fromEntries(
  Object.entries(DOCUMENT_CATEGORY_LABELS).filter(([value]) => !NON_PATIENT_UPLOADED_CATEGORIES.has(value))
)
