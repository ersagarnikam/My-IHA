-- Visa Lawyer Portal: lawyer-driven status changes on visa_submissions.
-- Lawyers only have SELECT on visa_submissions (20260826020000) — same
-- security-definer + lawyer_has_access_to_case() gate as request_visa_document
-- (20260826060000), plus an explicit transition allow-list so the status
-- can't be set out of the sequence the lawyer portal UI presents.
-- additional_docs_requested is intentionally not a target of this RPC — it's
-- still set exclusively by request_visa_document when a document is requested.
create or replace function public.update_visa_submission_status(
  p_case_id uuid,
  p_status  text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lawyer_id uuid;
  v_current   text;
begin
  select id into v_lawyer_id from public.lawyers where user_id = auth.uid();
  if v_lawyer_id is null or not public.lawyer_has_access_to_case(p_case_id) then
    raise exception 'unauthorized';
  end if;

  select status into v_current from public.visa_submissions where case_id = p_case_id for update;
  if v_current is null then
    raise exception 'not_found';
  end if;

  if not (
    (v_current = 'documents_submitted' and p_status = 'under_review') or
    (v_current = 'under_review' and p_status = 'processing') or
    (v_current = 'additional_docs_requested' and p_status in ('under_review', 'processing')) or
    (v_current = 'application_submitted' and p_status in ('processing', 'approved', 'rejected')) or
    (v_current = 'processing' and p_status in ('approved', 'rejected'))
  ) then
    raise exception 'invalid_transition';
  end if;

  update public.visa_submissions
  set status = p_status
  where case_id = p_case_id;
end;
$$;

revoke execute on function public.update_visa_submission_status from public;
grant execute on function public.update_visa_submission_status to authenticated;

-- Document requests are only meaningful while the lawyer is actively
-- reviewing the case: not before ('documents_submitted', the default a case
-- lands in straight from admin assignment — nothing's been reviewed yet to
-- find missing), and not once the application has moved past review
-- ('application_submitted'/'processing'/'approved'/'rejected') — the patient
-- upload window is already closed by then (see UPLOAD_LOCKED_STATUSES in
-- apps/patient/components/visa/visa-detail-documents.tsx), so a request
-- there could never be fulfilled. Same security-definer body as before, with
-- one added guard.
create or replace function public.request_visa_document(
  p_case_id      uuid,
  p_category     text,
  p_document_type text,
  p_instructions text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lawyer_id       uuid;
  v_current_status  text;
  v_request_id      uuid;
begin
  select id into v_lawyer_id from public.lawyers where user_id = auth.uid();
  if v_lawyer_id is null or not public.lawyer_has_access_to_case(p_case_id) then
    raise exception 'unauthorized';
  end if;

  select status into v_current_status from public.visa_submissions where case_id = p_case_id;
  if v_current_status not in ('under_review', 'additional_docs_requested') then
    raise exception 'case_not_under_review';
  end if;

  insert into public.visa_document_requests (case_id, lawyer_id, category, document_type, instructions)
  values (p_case_id, v_lawyer_id, p_category, p_document_type, p_instructions)
  returning id into v_request_id;

  update public.visa_submissions
  set status = 'additional_docs_requested'
  where case_id = p_case_id;

  return v_request_id;
end;
$$;

revoke execute on function public.request_visa_document from public;
grant execute on function public.request_visa_document to authenticated;
