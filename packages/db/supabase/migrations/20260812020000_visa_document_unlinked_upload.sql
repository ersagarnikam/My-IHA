-- Patients should be able to upload visa documents from the Documents page
-- without picking a case up front, then link to a case later — mirroring
-- how the Medical tab already works for case_documents. The check
-- constraint added in 20260731060000 required every row to carry a case_id
-- or visa_submission_id, which blocked that for patient uploads (it was
-- written for hospital-generated letters, which are always created for a
-- specific case and still need that guarantee).
alter table public.visa_documents drop constraint visa_documents_submission_or_case_check;
alter table public.visa_documents add constraint visa_documents_submission_or_case_check
  check (source = 'patient_upload' or visa_submission_id is not null or case_id is not null);

-- Attaches a previously-unlinked visa document (uploaded with no case
-- chosen) to a case, finding-or-creating that case's visa_submissions row
-- the same way add_visa_documents_for_case does.
create or replace function public.link_visa_document_to_case(
  p_document_id uuid,
  p_case_id     uuid
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient_id    uuid;
  v_doc_patient   uuid;
  v_doc_source    text;
  v_case_status   text;
  v_submission_id uuid;
begin
  select id into v_patient_id from public.patients where user_id = auth.uid();
  if v_patient_id is null then
    raise exception 'Unauthorized: patient not found';
  end if;

  select patient_id, source into v_doc_patient, v_doc_source
  from public.visa_documents where id = p_document_id;

  if v_doc_patient is null or v_doc_patient != v_patient_id or v_doc_source != 'patient_upload' then
    raise exception 'Document not found or unauthorized';
  end if;

  select status into v_case_status
  from public.cases
  where id = p_case_id and patient_id = v_patient_id;

  if v_case_status is null then
    raise exception 'Case not found or unauthorized';
  end if;

  if v_case_status not in ('payment_confirmed', 'visa_documents_submitted') then
    raise exception 'case_not_eligible_for_visa_documents';
  end if;

  insert into public.visa_submissions (case_id, patient_id, status)
  values (p_case_id, v_patient_id, 'not_started')
  on conflict (case_id) do update set updated_at = now()
  returning id into v_submission_id;

  update public.visa_documents
  set case_id = p_case_id, visa_submission_id = v_submission_id
  where id = p_document_id;

  return jsonb_build_object('submission_id', v_submission_id);
end;
$$;

grant execute on function public.link_visa_document_to_case(uuid, uuid) to authenticated;
