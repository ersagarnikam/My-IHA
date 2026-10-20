-- Nothing has ever set visa_documents.requested_by_lawyer = true on upload,
-- so fetchDocumentRequestsForCase's "fulfilled" check (which requires
-- requested_by_lawyer = true, per lib/data/documents.ts) never matches — a
-- patient's response to a document request always shows up as a brand new
-- row instead of resolving the pending request card.
--
-- packages/db/src/visa.ts (insertVisaDocument) now computes this flag
-- app-side for the single-document upload path. This migration applies the
-- same fix to the other upload path that can also respond to a request —
-- the Documents page's Visa tab, backed by add_visa_documents_for_case —
-- and backfills existing documents that already (silently) fulfilled a
-- request so their "Requested" badge stops being stuck.

create or replace function public.add_visa_documents_for_case(
  p_case_id   uuid,
  p_documents jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient_id    uuid;
  v_case_status   text;
  v_submission_id uuid;
  v_doc           jsonb;
  v_category      text;
  v_count         int := 0;
begin
  select id into v_patient_id from public.patients where user_id = auth.uid();
  if v_patient_id is null then
    raise exception 'Unauthorized: patient not found';
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

  for v_doc in select * from jsonb_array_elements(p_documents)
  loop
    v_category := v_doc->>'category';

    insert into public.visa_documents (
      visa_submission_id, patient_id, category, case_id,
      file_name, file_path, file_size_bytes, mime_type, requested_by_lawyer
    ) values (
      v_submission_id,
      v_patient_id,
      v_category,
      p_case_id,
      v_doc->>'file_name',
      v_doc->>'file_path',
      (v_doc->>'file_size_bytes')::int8,
      v_doc->>'mime_type',
      exists (
        select 1 from public.visa_document_requests r
        where r.case_id = p_case_id
          and r.category = v_category
          and not exists (
            select 1 from public.visa_documents d
            where d.case_id = p_case_id
              and d.category = v_category
              and d.requested_by_lawyer = true
              and d.uploaded_at > r.created_at
          )
      )
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('submission_id', v_submission_id, 'added', v_count);
end;
$$;

-- Backfill: mark any already-uploaded document as fulfilling a request if it
-- matches that request's case + category and was uploaded after it.
update public.visa_documents d
set requested_by_lawyer = true
where d.requested_by_lawyer = false
  and exists (
    select 1 from public.visa_document_requests r
    where r.case_id = d.case_id
      and r.category = d.category
      and r.created_at < d.uploaded_at
  );
