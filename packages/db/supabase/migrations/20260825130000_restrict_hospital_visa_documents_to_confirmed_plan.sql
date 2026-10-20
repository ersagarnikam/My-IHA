-- 20260731060000 gated hospital-generated visa letters (Hospital Invitation
-- Letter, Appointment Confirmation Letter) with `tp.status != 'draft'`, which
-- that migration's sibling (20260730060000) describes as mirroring "the
-- hospital selected on the confirmed... plan". It doesn't: once a case's
-- patient confirms (pays for) one hospital's plan, every other hospital that
-- was ever in the running has its plan closed out to 'not_selected' (or it
-- was already 'rejected_by_iha') — both still satisfy `!= 'draft'`. So any
-- hospital that competed for a case, including ones the patient did not
-- choose, could keep generating/overwriting that case's invitation and
-- appointment letters indefinitely. Worse, the storage path and the
-- `visa_documents` row are keyed only by (case_id, category) with no
-- hospital component, so a losing hospital calling this after the winning
-- hospital already generated the letter silently overwrites the winning
-- hospital's file and row.
--
-- This scopes write (and read) access to the one plan actually in the
-- 'patient_confirmed' state, and adds a defense-in-depth guard on the
-- upsert so a row can never change hands to a different hospital_id.

create or replace function public.hospital_has_confirmed_plan_for_case(target_case_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.treatment_plans tp
    join public.hospitals h on h.id = tp.hospital_id
    where tp.case_id = target_case_id
      and tp.status = 'patient_confirmed'
      and h.user_id = auth.uid()
  );
$$;

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
    and tp.status = 'patient_confirmed'
    and h.user_id = auth.uid()
  limit 1;

  if v_hospital_id is null then
    raise exception 'plan_not_selected';
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
  where public.visa_documents.hospital_id = excluded.hospital_id
  returning id into v_doc_id;

  if v_doc_id is null then
    raise exception 'plan_not_selected';
  end if;

  return jsonb_build_object('id', v_doc_id);
end;
$$;

-- Read/write access to the generated letters themselves (row + storage
-- object) is scoped to the confirmed plan's hospital, not every hospital
-- that ever competed for the case.
drop policy if exists "Hospitals can view their generated visa documents" on public.visa_documents;
create policy "Hospitals can view their generated visa documents"
  on public.visa_documents for select
  to authenticated
  using (
    source = 'hospital_generated'
    and public.hospital_has_confirmed_plan_for_case(case_id)
  );

drop policy if exists "Hospitals can write generated visa documents" on storage.objects;
create policy "Hospitals can write generated visa documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'visa-documents'
    and (storage.foldername(name))[1] = 'hospital-generated'
    and public.hospital_has_confirmed_plan_for_case(((storage.foldername(name))[2])::uuid)
  );

drop policy if exists "Hospitals can update generated visa documents" on storage.objects;
create policy "Hospitals can update generated visa documents"
  on storage.objects for update
  to authenticated
  using (
    bucket_id = 'visa-documents'
    and (storage.foldername(name))[1] = 'hospital-generated'
    and public.hospital_has_confirmed_plan_for_case(((storage.foldername(name))[2])::uuid)
  )
  with check (
    bucket_id = 'visa-documents'
    and (storage.foldername(name))[1] = 'hospital-generated'
    and public.hospital_has_confirmed_plan_for_case(((storage.foldername(name))[2])::uuid)
  );

drop policy if exists "Hospitals can read generated visa documents" on storage.objects;
create policy "Hospitals can read generated visa documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'visa-documents'
    and (storage.foldername(name))[1] = 'hospital-generated'
    and public.hospital_has_confirmed_plan_for_case(((storage.foldername(name))[2])::uuid)
  );
