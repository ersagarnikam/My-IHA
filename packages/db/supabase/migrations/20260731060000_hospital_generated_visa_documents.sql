-- Hospital-generated visa letters (Hospital Invitation Letter, Appointment
-- Confirmation Letter), reusing visa_documents rather than a new table.
--
-- A `source` column distinguishes these from the patient's own uploads under
-- the same `category` values so both can coexist without collision. Unlike
-- patient uploads, these aren't tied to a visa_submissions row at creation
-- time — the hospital can (and usually should) generate them *before* the
-- patient has started their visa application, so `visa_submission_id`
-- becomes nullable and a denormalised `case_id` is added instead. Once the
-- patient does start their application (`submit_visa_application`), any
-- hospital-generated rows for that case are linked to the new submission so
-- they show up in the existing visa document list with no extra code there.

alter table public.visa_documents
  add column source text not null default 'patient_upload' check (source in ('patient_upload', 'hospital_generated')),
  add column hospital_id uuid references public.hospitals(id),
  add column case_id uuid references public.cases(id),
  add column sent_to_patient_at timestamptz,
  alter column visa_submission_id drop not null,
  add constraint visa_documents_submission_or_case_check check (visa_submission_id is not null or case_id is not null);

create unique index visa_documents_hospital_generated_unique
  on public.visa_documents (case_id, category)
  where source = 'hospital_generated';

-- Patients still see all their own uploads unconditionally; hospital-generated
-- rows only once the hospital has explicitly sent them.
drop policy if exists "Patients read own visa documents" on public.visa_documents;
create policy "Patients read own visa documents"
  on public.visa_documents for select
  using (
    auth.uid() = (select user_id from public.patients where id = patient_id and not is_deleted)
    and (source = 'patient_upload' or sent_to_patient_at is not null)
  );

create policy "Hospitals can view their generated visa documents"
  on public.visa_documents for select
  to authenticated
  using (
    source = 'hospital_generated'
    and public.hospital_has_access_to_case(case_id)
  );

-- No direct insert/update policy for hospital rows — writes only via the
-- security-definer RPCs below, same convention as submit_visa_application.

create or replace function public.generate_hospital_visa_document(
  p_case_id uuid,
  p_document_type text,
  p_file_path text,
  p_file_name text,
  p_file_size_bytes bigint,
  p_mime_type text
)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital_id uuid;
  v_patient_id  uuid;
  v_case_status text;
  v_doc_id      uuid;
begin
  if p_document_type not in ('hospital_invitation', 'appointment_confirmation') then
    raise exception 'invalid_document_type';
  end if;

  select h.id into v_hospital_id
  from public.treatment_plans tp
  join public.hospitals h on h.id = tp.hospital_id
  where tp.case_id = p_case_id
    and tp.status != 'draft'
    and h.user_id = auth.uid()
  limit 1;

  if v_hospital_id is null then
    raise exception 'unauthorized';
  end if;

  select status, patient_id into v_case_status, v_patient_id
  from public.cases where id = p_case_id;

  if v_case_status is null or v_case_status not in (
    'payment_confirmed', 'visa_documents_submitted', 'visa_processing', 'travel_ready', 'completed'
  ) then
    raise exception 'case_not_payment_confirmed';
  end if;

  insert into public.visa_documents (
    case_id, visa_submission_id, patient_id, category,
    file_name, file_path, file_size_bytes, mime_type,
    source, hospital_id
  ) values (
    p_case_id,
    (select id from public.visa_submissions where case_id = p_case_id),
    v_patient_id, p_document_type,
    p_file_name, p_file_path, p_file_size_bytes, p_mime_type,
    'hospital_generated', v_hospital_id
  )
  on conflict (case_id, category) where source = 'hospital_generated' do update set
    file_name = excluded.file_name,
    file_path = excluded.file_path,
    file_size_bytes = excluded.file_size_bytes,
    mime_type = excluded.mime_type,
    uploaded_at = now(),
    sent_to_patient_at = null
  returning id into v_doc_id;

  return jsonb_build_object('id', v_doc_id);
end;
$$;

grant execute on function public.generate_hospital_visa_document(uuid, text, text, text, bigint, text) to authenticated;

create or replace function public.send_visa_document_to_patient(p_document_id uuid)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row public.visa_documents%rowtype;
begin
  update public.visa_documents vd
  set sent_to_patient_at = now()
  where vd.id = p_document_id
    and vd.source = 'hospital_generated'
    and exists (
      select 1 from public.hospitals h
      where h.id = vd.hospital_id and h.user_id = auth.uid()
    )
  returning * into v_row;

  if v_row.id is null then
    raise exception 'unauthorized';
  end if;

  return jsonb_build_object('id', v_row.id, 'case_id', v_row.case_id, 'category', v_row.category);
end;
$$;

grant execute on function public.send_visa_document_to_patient(uuid) to authenticated;

-- Link any hospital-generated letters to the patient's visa submission the
-- moment they start one, so the existing visa document list picks them up
-- with zero changes there. Also stamps case_id on the patient's own uploads
-- going forward for consistency with the new column.
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

  insert into public.visa_submissions (case_id, patient_id, form_data, status)
  values (p_case_id, v_patient_id, p_form_data, 'documents_submitted')
  on conflict (case_id) do update
    set form_data = excluded.form_data,
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

-- Storage: reuse the existing 'visa-documents' bucket under a distinct
-- 'hospital-generated/{caseId}/{documentType}.pdf' prefix (the patient path
-- convention is '{patientUserId}/...', which the hospital can't satisfy).
create policy "Hospitals can write generated visa documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'visa-documents'
    and (storage.foldername(name))[1] = 'hospital-generated'
    and public.hospital_has_access_to_case(((storage.foldername(name))[2])::uuid)
  );

create policy "Hospitals can update generated visa documents"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'visa-documents'
    and (storage.foldername(name))[1] = 'hospital-generated'
    and public.hospital_has_access_to_case(((storage.foldername(name))[2])::uuid)
  )
  with check (
    bucket_id = 'visa-documents'
    and (storage.foldername(name))[1] = 'hospital-generated'
    and public.hospital_has_access_to_case(((storage.foldername(name))[2])::uuid)
  );

create policy "Hospitals can read generated visa documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'visa-documents'
    and (storage.foldername(name))[1] = 'hospital-generated'
    and public.hospital_has_access_to_case(((storage.foldername(name))[2])::uuid)
  );

create policy "Patients can read sent generated visa documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'visa-documents'
    and exists (
      select 1 from public.visa_documents vd
      join public.patients p on p.id = vd.patient_id
      where vd.file_path = storage.objects.name
        and vd.source = 'hospital_generated'
        and p.user_id = auth.uid()
        and vd.sent_to_patient_at is not null
    )
  );
