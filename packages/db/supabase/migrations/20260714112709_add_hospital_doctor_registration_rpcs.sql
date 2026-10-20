-- ─────────────────────────────────────────────────────────
-- RPC: register_hospital
-- security definer so it can insert into hospitals (no client insert policy
-- exists) while still guaranteeing status can only ever start as 'pending'
-- and user_id is always the caller's own id. Mirrors the
-- confirm_treatment_option() security-definer pattern.
-- ─────────────────────────────────────────────────────────
create or replace function public.register_hospital(
  p_name                        text,
  p_registration_type           text,
  p_registration_number         text,
  p_abn_number                  text,
  p_city                        text,
  p_country                     text,
  p_address                     text,
  p_zip_code                    text,
  p_phone                       text,
  p_contact_email               text,
  p_specialties                 text[],
  p_bed_count                   int,
  p_license_number              text,
  p_accreditation_body          text,
  p_certificates                jsonb,
  p_administrator_name          text,
  p_administrator_designation   text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  if exists (select 1 from public.hospitals where user_id = auth.uid())
     or exists (select 1 from public.doctors where user_id = auth.uid()) then
    raise exception 'already_registered';
  end if;

  insert into public.hospitals (
    name, city, country, user_id, status,
    registration_type, registration_number, abn_number, address, zip_code, phone,
    contact_email, specialties, bed_count, license_number, accreditation_body,
    certificates, administrator_name, administrator_designation
  ) values (
    p_name, p_city, p_country, auth.uid(), 'pending',
    p_registration_type, p_registration_number, p_abn_number, p_address, p_zip_code, p_phone,
    p_contact_email, p_specialties, p_bed_count, p_license_number, p_accreditation_body,
    coalesce(p_certificates, '[]'::jsonb), p_administrator_name, p_administrator_designation
  )
  returning id into v_hospital_id;

  return v_hospital_id;
end;
$$;

revoke execute on function public.register_hospital from public;
grant execute on function public.register_hospital to authenticated;

-- ─────────────────────────────────────────────────────────
-- RPC: register_doctor
-- specialty (legacy singular column) is auto-filled from the first entry of
-- p_specialties so the existing not-null constraint (used by the Patient
-- Portal's treatment-option display) keeps being satisfied without changing
-- that column's semantics.
-- ─────────────────────────────────────────────────────────
create or replace function public.register_doctor(
  p_full_name         text,
  p_specialties        text[],
  p_qualifications     text,
  p_years_experience   int,
  p_bio                text,
  p_photo_url          text,
  p_languages_spoken   text[],
  p_license_number     text,
  p_contact_email      text,
  p_contact_phone      text,
  p_hospital_ids       uuid[] default '{}'
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doctor_id uuid;
  v_hospital_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  if array_length(p_specialties, 1) is null then
    raise exception 'at_least_one_specialty_required';
  end if;

  if exists (select 1 from public.hospitals where user_id = auth.uid())
     or exists (select 1 from public.doctors where user_id = auth.uid()) then
    raise exception 'already_registered';
  end if;

  insert into public.doctors (
    full_name, specialty, user_id, status,
    specialties, qualifications, years_experience, bio, photo_url,
    languages_spoken, license_number, contact_email, contact_phone
  ) values (
    p_full_name, p_specialties[1], auth.uid(), 'pending',
    p_specialties, p_qualifications, p_years_experience, p_bio, p_photo_url,
    p_languages_spoken, p_license_number, p_contact_email, p_contact_phone
  )
  returning id into v_doctor_id;

  foreach v_hospital_id in array coalesce(p_hospital_ids, '{}') loop
    insert into public.doctor_hospital_affiliations (doctor_id, hospital_id)
    values (v_doctor_id, v_hospital_id)
    on conflict (doctor_id, hospital_id) do nothing;
  end loop;

  return v_doctor_id;
end;
$$;

revoke execute on function public.register_doctor from public;
grant execute on function public.register_doctor to authenticated;

-- ─────────────────────────────────────────────────────────
-- RPC: resubmit_hospital_registration
-- Reopens a rejected/more_info_requested row in place (not a duplicate).
-- ─────────────────────────────────────────────────────────
create or replace function public.resubmit_hospital_registration(
  p_hospital_id                 uuid,
  p_name                        text,
  p_registration_type           text,
  p_registration_number         text,
  p_abn_number                  text,
  p_city                        text,
  p_country                     text,
  p_address                     text,
  p_zip_code                    text,
  p_phone                       text,
  p_contact_email               text,
  p_specialties                 text[],
  p_bed_count                   int,
  p_license_number              text,
  p_accreditation_body          text,
  p_certificates                jsonb,
  p_administrator_name          text,
  p_administrator_designation   text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.hospitals
    where id = p_hospital_id
      and user_id = auth.uid()
      and status in ('rejected', 'more_info_requested')
  ) then
    raise exception 'not_resubmittable';
  end if;

  update public.hospitals set
    name = p_name,
    city = p_city,
    country = p_country,
    registration_type = p_registration_type,
    registration_number = p_registration_number,
    abn_number = p_abn_number,
    address = p_address,
    zip_code = p_zip_code,
    phone = p_phone,
    contact_email = p_contact_email,
    specialties = p_specialties,
    bed_count = p_bed_count,
    license_number = p_license_number,
    accreditation_body = p_accreditation_body,
    certificates = coalesce(p_certificates, '[]'::jsonb),
    administrator_name = p_administrator_name,
    administrator_designation = p_administrator_designation,
    status = 'pending',
    rejection_reason = null,
    more_info_message = null
  where id = p_hospital_id;
end;
$$;

revoke execute on function public.resubmit_hospital_registration from public;
grant execute on function public.resubmit_hospital_registration to authenticated;

-- ─────────────────────────────────────────────────────────
-- RPC: resubmit_doctor_registration
-- ─────────────────────────────────────────────────────────
create or replace function public.resubmit_doctor_registration(
  p_doctor_id          uuid,
  p_full_name          text,
  p_specialties         text[],
  p_qualifications      text,
  p_years_experience    int,
  p_bio                 text,
  p_photo_url           text,
  p_languages_spoken    text[],
  p_license_number      text,
  p_contact_email       text,
  p_contact_phone       text,
  p_hospital_ids        uuid[] default '{}'
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital_id uuid;
begin
  if not exists (
    select 1 from public.doctors
    where id = p_doctor_id
      and user_id = auth.uid()
      and status in ('rejected', 'more_info_requested')
  ) then
    raise exception 'not_resubmittable';
  end if;

  if array_length(p_specialties, 1) is null then
    raise exception 'at_least_one_specialty_required';
  end if;

  update public.doctors set
    full_name = p_full_name,
    specialty = p_specialties[1],
    specialties = p_specialties,
    qualifications = p_qualifications,
    years_experience = p_years_experience,
    bio = p_bio,
    photo_url = p_photo_url,
    languages_spoken = p_languages_spoken,
    license_number = p_license_number,
    contact_email = p_contact_email,
    contact_phone = p_contact_phone,
    status = 'pending',
    rejection_reason = null,
    more_info_message = null
  where id = p_doctor_id;

  delete from public.doctor_hospital_affiliations where doctor_id = p_doctor_id;

  foreach v_hospital_id in array coalesce(p_hospital_ids, '{}') loop
    insert into public.doctor_hospital_affiliations (doctor_id, hospital_id)
    values (p_doctor_id, v_hospital_id)
    on conflict (doctor_id, hospital_id) do nothing;
  end loop;
end;
$$;

revoke execute on function public.resubmit_doctor_registration from public;
grant execute on function public.resubmit_doctor_registration to authenticated;
