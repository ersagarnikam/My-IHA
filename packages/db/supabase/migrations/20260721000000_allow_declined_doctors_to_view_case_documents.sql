-- Declining/withdrawing from a case shouldn't cut a doctor off from the
-- case's read-only history — they should still see everything they saw
-- while invited/accepted, just without the accept/decline actions. The
-- `cases`/`patients` policies already grant access regardless of
-- doctor_case_assignments.status; case_documents (table + storage) were
-- the only ones still gated to `invited`/`accepted`, so drop that filter
-- to match.

drop policy if exists "Doctors can view assigned case documents" on public.case_documents;
create policy "Doctors can view assigned case documents"
  on public.case_documents for select
  to authenticated
  using (
    exists (
      select 1 from public.doctor_case_assignments dca
      join public.doctors d on d.id = dca.doctor_id
      where dca.case_id = case_documents.case_id
        and d.user_id = auth.uid()
    )
  );

drop policy if exists "Doctors can read assigned case document files" on storage.objects;
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
    )
  );
