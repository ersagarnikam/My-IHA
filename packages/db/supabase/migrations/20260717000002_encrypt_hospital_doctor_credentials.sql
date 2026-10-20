-- Encrypt hospital/doctor regulatory identifiers at rest:
-- hospitals.registration_number, hospitals.abn_number, hospitals.license_number,
-- doctors.license_number. Same computed-column pattern as the patients/cases/
-- visa_submissions encryption migrations.

alter table public.hospitals rename column registration_number to registration_number_enc;
alter table public.hospitals rename column abn_number to abn_number_enc;
alter table public.hospitals rename column license_number to license_number_enc;

alter table public.hospitals
  alter column registration_number_enc type bytea using public.encrypt_pii(registration_number_enc),
  alter column abn_number_enc type bytea using public.encrypt_pii(abn_number_enc),
  alter column license_number_enc type bytea using public.encrypt_pii(license_number_enc);

revoke select (registration_number_enc, abn_number_enc, license_number_enc)
  on public.hospitals from authenticated, anon;

create or replace function public.registration_number(h public.hospitals)
returns text
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(h.registration_number_enc) $$;

create or replace function public.abn_number(h public.hospitals)
returns text
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(h.abn_number_enc) $$;

create or replace function public.license_number(h public.hospitals)
returns text
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(h.license_number_enc) $$;

grant execute on function public.registration_number(public.hospitals) to authenticated;
grant execute on function public.abn_number(public.hospitals) to authenticated;
grant execute on function public.license_number(public.hospitals) to authenticated;

alter table public.doctors rename column license_number to license_number_enc;

alter table public.doctors
  alter column license_number_enc type bytea using public.encrypt_pii(license_number_enc);

revoke select (license_number_enc) on public.doctors from authenticated, anon;

-- Overloaded on argument type (public.hospitals vs public.doctors) — Postgres
-- resolves the right one per-table, same as any other function overload.
create or replace function public.license_number(d public.doctors)
returns text
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(d.license_number_enc) $$;

grant execute on function public.license_number(public.doctors) to authenticated;

-- Write paths: register_hospital / resubmit_hospital_registration /
-- register_doctor / resubmit_doctor_registration, re-created with their
-- current signatures (20260715130000 / 20260716080000) so this doesn't
-- create stray overloads — only the body changes, to encrypt on the way in.

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
  p_room_types                  text[] default '{}'
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
    registration_type, registration_number_enc, abn_number_enc, address, zip_code, phone,
    contact_email, specialties, bed_count, license_number_enc, accreditation_body,
    certificates, room_types
  ) values (
    p_name, p_city, p_country, auth.uid(), 'pending',
    p_registration_type, public.encrypt_pii(p_registration_number), public.encrypt_pii(p_abn_number),
    p_address, p_zip_code, p_phone,
    p_contact_email, p_specialties, p_bed_count, public.encrypt_pii(p_license_number), p_accreditation_body,
    coalesce(p_certificates, '[]'::jsonb), coalesce(p_room_types, '{}')
  )
  returning id into v_hospital_id;

  return v_hospital_id;
end;
$$;

revoke execute on function public.register_hospital from public;
grant execute on function public.register_hospital to authenticated;

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
  p_room_types                  text[] default '{}'
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
    registration_number_enc = public.encrypt_pii(p_registration_number),
    abn_number_enc = public.encrypt_pii(p_abn_number),
    address = p_address,
    zip_code = p_zip_code,
    phone = p_phone,
    contact_email = p_contact_email,
    specialties = p_specialties,
    bed_count = p_bed_count,
    license_number_enc = public.encrypt_pii(p_license_number),
    accreditation_body = p_accreditation_body,
    certificates = coalesce(p_certificates, '[]'::jsonb),
    room_types = coalesce(p_room_types, '{}'),
    status = 'pending',
    rejection_reason = null,
    more_info_message = null
  where id = p_hospital_id;
end;
$$;

revoke execute on function public.resubmit_hospital_registration from public;
grant execute on function public.resubmit_hospital_registration to authenticated;

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
  p_hospital_ids       uuid[] default '{}',
  p_department         text default null,
  p_role               text default null,
  p_working_days       text[] default '{}',
  p_certificates       jsonb default '[]'::jsonb
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
    full_name, user_id, status,
    specialties, qualifications, years_experience, bio, photo_url,
    languages_spoken, license_number_enc, contact_email, contact_phone,
    department, role, working_days, certificates
  ) values (
    p_full_name, auth.uid(), 'pending',
    p_specialties, p_qualifications, p_years_experience, p_bio, p_photo_url,
    p_languages_spoken, public.encrypt_pii(p_license_number), p_contact_email, p_contact_phone,
    p_department, p_role, coalesce(p_working_days, '{}'), coalesce(p_certificates, '[]'::jsonb)
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
  p_hospital_ids        uuid[] default '{}',
  p_department          text default null,
  p_role                text default null,
  p_working_days        text[] default '{}',
  p_certificates        jsonb default '[]'::jsonb
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
    specialties = p_specialties,
    qualifications = p_qualifications,
    years_experience = p_years_experience,
    bio = p_bio,
    photo_url = p_photo_url,
    languages_spoken = p_languages_spoken,
    license_number_enc = public.encrypt_pii(p_license_number),
    contact_email = p_contact_email,
    contact_phone = p_contact_phone,
    department = p_department,
    role = p_role,
    working_days = coalesce(p_working_days, '{}'),
    certificates = coalesce(p_certificates, '[]'::jsonb),
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
