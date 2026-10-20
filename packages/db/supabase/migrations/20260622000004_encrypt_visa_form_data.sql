-- Encrypt visa_submissions.form_data at rest (contains passport_number,
-- passport_expiry, DOB, nationality, phone, email, companion details).
-- Same computed-column pattern as the patients/cases migrations, except the
-- decrypted value is cast back to jsonb rather than text.

alter table public.visa_submissions rename column form_data to form_data_enc;
alter table public.visa_submissions alter column form_data_enc drop default;

alter table public.visa_submissions
  alter column form_data_enc type bytea
  using public.encrypt_pii(form_data_enc::text);

revoke select (form_data_enc) on public.visa_submissions from authenticated, anon;

create or replace function public.form_data(v public.visa_submissions)
returns jsonb
language sql
stable
set search_path = ''
as $$
  select case
    when v.form_data_enc is null then null
    else public.decrypt_pii(v.form_data_enc)::jsonb
  end;
$$;

grant execute on function public.form_data(public.visa_submissions) to authenticated;

-- Re-point the existing submit_visa_application RPC (same signature) at the
-- encrypted column. No app-code change needed for the write path.
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
  SELECT id INTO v_patient_id
  FROM public.patients
  WHERE user_id = auth.uid();

  IF v_patient_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: patient not found';
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM public.cases
    WHERE id = p_case_id AND patient_id = v_patient_id
  ) THEN
    RAISE EXCEPTION 'Case not found or unauthorized';
  END IF;

  INSERT INTO public.visa_submissions (case_id, patient_id, form_data_enc, status)
  VALUES (p_case_id, v_patient_id, public.encrypt_pii(p_form_data::text), 'documents_submitted')
  ON CONFLICT (case_id) DO UPDATE
    SET form_data_enc = EXCLUDED.form_data_enc,
        status        = 'documents_submitted',
        updated_at    = now()
  RETURNING id INTO v_submission_id;

  FOR v_doc IN SELECT * FROM jsonb_array_elements(p_documents)
  LOOP
    INSERT INTO public.visa_documents (
      visa_submission_id, patient_id, category,
      file_name, file_path, file_size_bytes, mime_type
    ) VALUES (
      v_submission_id,
      v_patient_id,
      v_doc->>'category',
      v_doc->>'file_name',
      v_doc->>'file_path',
      (v_doc->>'file_size_bytes')::int8,
      v_doc->>'mime_type'
    );
  END LOOP;

  UPDATE public.cases
  SET status = 'visa_documents_submitted', updated_at = now()
  WHERE id = p_case_id AND patient_id = v_patient_id;

  RETURN jsonb_build_object('submission_id', v_submission_id);
end;
$$;

grant execute on function public.submit_visa_application(uuid, jsonb, jsonb) to authenticated;
