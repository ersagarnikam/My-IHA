-- Visa Lawyer Portal Module 06 (Visa Outcome Management), SOW 6.1: lawyer
-- uploads the approved visa once a case's visa_submissions.status = 'approved',
-- patient is notified and can download it. Reuses visa_documents with a new
-- `source = 'lawyer_issued'` discriminator (category 'approved_visa') rather
-- than a new table — same pattern as hospital-generated letters
-- (20260731060000_hospital_generated_visa_documents.sql). Unlike that flow,
-- there's no separate "send to patient" step: the RPC stamps
-- sent_to_patient_at immediately on insert, matching the SOW's single-step
-- "lawyer uploads → patient notified" description.

alter table public.visa_documents
  drop constraint visa_documents_source_check,
  add constraint visa_documents_source_check
    check (source in ('patient_upload', 'hospital_generated', 'lawyer_issued'));

create unique index visa_documents_lawyer_issued_unique
  on public.visa_documents (case_id, category)
  where source = 'lawyer_issued';

-- Patients can already read their own patient_upload rows and sent
-- hospital_generated rows (see prior migrations' policies on this table) —
-- add the lawyer_issued case alongside those.
create policy "Patients can read their lawyer-issued visa documents"
  on public.visa_documents for select
  to authenticated
  using (
    source = 'lawyer_issued'
    and auth.uid() = (select user_id from public.patients where id = patient_id and not is_deleted)
  );

create or replace function public.record_lawyer_visa_document(
  p_case_id          uuid,
  p_file_path        text,
  p_file_name        text,
  p_file_size_bytes  bigint,
  p_mime_type        text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lawyer_id  uuid;
  v_patient_id uuid;
  v_submission record;
  v_doc_id     uuid;
begin
  select id into v_lawyer_id from public.lawyers where user_id = auth.uid();
  if v_lawyer_id is null or not public.lawyer_has_access_to_case(p_case_id) then
    raise exception 'unauthorized';
  end if;

  select id, patient_id, status into v_submission
  from public.visa_submissions where case_id = p_case_id for update;

  if v_submission.id is null then
    raise exception 'not_found';
  end if;

  if v_submission.status != 'approved' then
    raise exception 'visa_not_approved';
  end if;

  insert into public.visa_documents (
    case_id, visa_submission_id, patient_id, category,
    file_name, file_path, file_size_bytes, mime_type,
    source, sent_to_patient_at
  ) values (
    p_case_id, v_submission.id, v_submission.patient_id, 'approved_visa',
    p_file_name, p_file_path, p_file_size_bytes, p_mime_type,
    'lawyer_issued', now()
  )
  on conflict (case_id, category) where source = 'lawyer_issued' do update set
    file_name = excluded.file_name,
    file_path = excluded.file_path,
    file_size_bytes = excluded.file_size_bytes,
    mime_type = excluded.mime_type,
    uploaded_at = now(),
    sent_to_patient_at = now()
  returning id, patient_id into v_doc_id, v_patient_id;

  return jsonb_build_object('id', v_doc_id, 'patient_id', v_patient_id);
end;
$$;

revoke execute on function public.record_lawyer_visa_document(uuid, text, text, bigint, text) from public;
grant execute on function public.record_lawyer_visa_document(uuid, text, text, bigint, text) to authenticated;

-- Storage: reuse the existing 'visa-documents' bucket under a distinct
-- 'lawyer-issued/{caseId}/{fileName}' prefix, gated on case access (same
-- shape as the hospital 'hospital-generated/{caseId}/...' policies). Lawyers
-- already have blanket read access to any file_path with a matching
-- visa_documents.case_id row (20260826040000), so only insert/update are
-- needed here.
create policy "Lawyers can write approved visa documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'visa-documents'
    and (storage.foldername(name))[1] = 'lawyer-issued'
    and public.lawyer_has_access_to_case(((storage.foldername(name))[2])::uuid)
  );

create policy "Lawyers can update approved visa documents"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'visa-documents'
    and (storage.foldername(name))[1] = 'lawyer-issued'
    and public.lawyer_has_access_to_case(((storage.foldername(name))[2])::uuid)
  )
  with check (
    bucket_id = 'visa-documents'
    and (storage.foldername(name))[1] = 'lawyer-issued'
    and public.lawyer_has_access_to_case(((storage.foldername(name))[2])::uuid)
  );

create policy "Patients can read their approved visa document in storage"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'visa-documents'
    and exists (
      select 1 from public.visa_documents vd
      join public.patients p on p.id = vd.patient_id
      where vd.file_path = storage.objects.name
        and vd.source = 'lawyer_issued'
        and p.user_id = auth.uid()
    )
  );
