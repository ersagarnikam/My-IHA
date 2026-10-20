-- Expand the document_type check constraint to include visa document categories.
-- Drop the old constraint that only covered medical types, then re-add it with
-- all valid values (medical + visa).

alter table public.case_documents
  drop constraint case_documents_type_check;

alter table public.case_documents
  add constraint case_documents_type_check check (document_type in (
    -- medical
    'lab_report', 'mri_ct', 'xray', 'prescription', 'medical_history', 'other',
    -- visa
    'passport', 'passport_photograph', 'hospital_invitation',
    'appointment_confirmation', 'bank_statement', 'sponsorship_letter',
    'employer_letter', 'companion_passport', 'companion_proof_of_relationship'
  ));
