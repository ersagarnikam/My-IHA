-- request_visa_document previously inserted the patient's document_requested
-- notification directly via raw SQL — that only ever reaches the in-portal
-- bell, since a Postgres function can't call the email/SMS providers
-- (@iha/notifications) the way insertNotification() (packages/db/src/cases.ts)
-- does from application code. The RPC now only creates the request row and
-- advances status; apps/visa's requestDocumentAction calls insertNotification()
-- itself afterward, same pattern apps/hospital's visa-documents.ts already
-- uses to notify patients with real email/SMS dispatch.
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
  v_request_id      uuid;
begin
  select id into v_lawyer_id from public.lawyers where user_id = auth.uid();
  if v_lawyer_id is null or not public.lawyer_has_access_to_case(p_case_id) then
    raise exception 'unauthorized';
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
