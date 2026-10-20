-- Lets a patient add visa documents for a case from the general Documents
-- page (Visa tab), independent of the visa application wizard. Unlike
-- submit_visa_application this never touches cases.status or the
-- submission's own status — it's the same "just attach more files" behavior
-- as the existing "Add documents" action on the visa case detail page
-- (addVisaDocument/insertVisaDocument), except it also creates the case's
-- visa_submissions row on first use so a case doesn't need to have started
-- its visa application before documents can be attached to it here.
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
    insert into public.visa_documents (
      visa_submission_id, patient_id, category, case_id,
      file_name, file_path, file_size_bytes, mime_type
    ) values (
      v_submission_id,
      v_patient_id,
      v_doc->>'category',
      p_case_id,
      v_doc->>'file_name',
      v_doc->>'file_path',
      (v_doc->>'file_size_bytes')::int8,
      v_doc->>'mime_type'
    );
    v_count := v_count + 1;
  end loop;

  return jsonb_build_object('submission_id', v_submission_id, 'added', v_count);
end;
$$;

grant execute on function public.add_visa_documents_for_case(uuid, jsonb) to authenticated;
