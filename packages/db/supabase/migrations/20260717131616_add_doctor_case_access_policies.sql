-- Grants doctors read access to cases and case documents they've been
-- assigned to, scoped through doctor_case_assignments. See module 04.

create policy "Doctors can view assigned cases"
  on public.cases for select
  to authenticated
  using (
    exists (
      select 1 from public.doctor_case_assignments dca
      join public.doctors d on d.id = dca.doctor_id
      where dca.case_id = cases.id and d.user_id = auth.uid()
    )
  );

create policy "Doctors can view assigned case documents"
  on public.case_documents for select
  to authenticated
  using (
    exists (
      select 1 from public.doctor_case_assignments dca
      join public.doctors d on d.id = dca.doctor_id
      where dca.case_id = case_documents.case_id
        and d.user_id = auth.uid()
        and dca.status in ('invited', 'accepted')
    )
  );

-- Storage: table-level access above isn't enough — createCaseDocumentSignedUrl()
-- hits storage.objects RLS directly, and the existing bucket policies
-- (20260602000001_create_cases_tables.sql) only ever check patients.user_id.
-- Without this, a doctor's signed-URL request 403s even though the
-- case_documents row read succeeds.
create policy "Doctors can read assigned case document files"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'case-documents'
    and exists (
      select 1
      from public.case_documents cd
      join public.doctor_case_assignments dca on dca.case_id = cd.case_id
      join public.doctors d on d.id = dca.doctor_id
      where cd.file_path = storage.objects.name
        and d.user_id = auth.uid()
        and dca.status in ('invited', 'accepted')
    )
  );
