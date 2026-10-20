-- 20260731060000_hospital_generated_visa_documents.sql redefined
-- submit_visa_application to link hospital-generated documents into new
-- submissions, but was branched from a copy of the function that predates
-- 20260622000004_encrypt_visa_form_data.sql: it inserts/updates the plain
-- `form_data` column (renamed to `form_data_enc` by that migration, with
-- `form_data` now only existing as a decrypting computed-column function),
-- and skips encrypt_pii entirely. That breaks every submission with
-- `column "form_data" of relation "visa_submissions" does not exist` and,
-- had the column still existed, would have stored PII unencrypted. Restore
-- the form_data_enc/encrypt_pii write path, keeping the hospital-generated
-- document linking from the 0731 migration unchanged.

create or replace function public.submit_visa_application(
  p_case_id   uuid,
  p_form_data jsonb,
  p_documents jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_patient_id    uuid;
  v_submission_id uuid;
  v_doc           jsonb;
begin
  select id into v_patient_id from public.patients where user_id = auth.uid();
  if v_patient_id is null then
    raise exception 'Unauthorized: patient not found';
  end if;

  if not exists (select 1 from public.cases where id = p_case_id and patient_id = v_patient_id) then
    raise exception 'Case not found or unauthorized';
  end if;

  insert into public.visa_submissions (case_id, patient_id, form_data_enc, status)
  values (p_case_id, v_patient_id, public.encrypt_pii(p_form_data::text), 'documents_submitted')
  on conflict (case_id) do update
    set form_data_enc = excluded.form_data_enc,
        status = 'documents_submitted',
        updated_at = now()
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
  end loop;

  update public.visa_documents
  set visa_submission_id = v_submission_id
  where case_id = p_case_id and source = 'hospital_generated' and visa_submission_id is null;

  update public.cases
  set status = 'visa_documents_submitted', updated_at = now()
  where id = p_case_id and patient_id = v_patient_id;

  return jsonb_build_object('submission_id', v_submission_id);
end;
$$;

grant execute on function public.submit_visa_application(uuid, jsonb, jsonb) to authenticated;
