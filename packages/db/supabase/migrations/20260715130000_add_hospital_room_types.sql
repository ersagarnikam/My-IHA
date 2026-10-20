-- ─────────────────────────────────────────────────────────
-- hospitals.room_types
-- Free-form list of room categories a hospital offers (e.g. "General",
-- "Private", "Deluxe") — differs per hospital, so unlike `specialties` this
-- isn't drawn from a shared catalog table, just hospital-entered text.
-- ─────────────────────────────────────────────────────────
alter table public.hospitals
  add column if not exists room_types text[] not null default '{}';

-- ─────────────────────────────────────────────────────────
-- register_hospital / resubmit_hospital_registration: append p_room_types.
-- Function identity in Postgres includes the parameter list, so even a
-- defaulted trailing parameter makes CREATE OR REPLACE create a second
-- overload rather than replacing the old one — the old signatures must be
-- dropped explicitly first (same issue as 20260715120000).
-- ─────────────────────────────────────────────────────────
drop function if exists public.register_hospital(
  text, text, text, text, text, text, text, text, text, text, text[], int, text, text, jsonb
);

drop function if exists public.resubmit_hospital_registration(
  uuid, text, text, text, text, text, text, text, text, text, text, text[], int, text, text, jsonb
);

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
    registration_type, registration_number, abn_number, address, zip_code, phone,
    contact_email, specialties, bed_count, license_number, accreditation_body,
    certificates, room_types
  ) values (
    p_name, p_city, p_country, auth.uid(), 'pending',
    p_registration_type, p_registration_number, p_abn_number, p_address, p_zip_code, p_phone,
    p_contact_email, p_specialties, p_bed_count, p_license_number, p_accreditation_body,
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
    room_types = coalesce(p_room_types, '{}'),
    status = 'pending',
    rejection_reason = null,
    more_info_message = null
  where id = p_hospital_id;
end;
$$;

revoke execute on function public.resubmit_hospital_registration from public;
grant execute on function public.resubmit_hospital_registration to authenticated;
