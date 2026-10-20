-- Lawyers already have DB-row access to visa_documents (see
-- 20260826030000), but createVisaDocumentSignedUrl() calls
-- storage.createSignedUrl() through a user-scoped client, which is subject
-- to storage.objects RLS separately from the table RLS — no policy granted
-- lawyers access there, so every signed-URL request silently failed and no
-- download link ever rendered. Mirrors "Patients can read sent generated
-- visa documents" (20260731060000_hospital_generated_visa_documents.sql),
-- joining storage.objects.name against visa_documents.file_path, but gated
-- on case access rather than patient ownership, and not restricted to
-- hospital-generated docs — a lawyer needs every document on their case.
create policy "Lawyers can read visa documents in storage for their cases"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'visa-documents'
    and exists (
      select 1 from public.visa_documents vd
      where vd.file_path = storage.objects.name
        and vd.case_id is not null
        and public.lawyer_has_access_to_case(vd.case_id)
    )
  );

