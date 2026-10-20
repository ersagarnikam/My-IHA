-- ─────────────────────────────────────────────────────────
-- Remove hospital administrator name/designation fields.
-- Step 3 of the hospital registration wizard no longer collects these —
-- only login credentials are needed there. Run this in the SQL editor to
-- bring an already-migrated local/remote database in line with the current
-- migrations (20260714112704 and 20260714112709), which no longer define
-- these fields for newly-provisioned databases.
-- ─────────────────────────────────────────────────────────

-- Function identity in Postgres includes the parameter list, and
-- CREATE OR REPLACE can't drop parameters — so the old signatures must be
-- dropped explicitly before recreating them without administrator_name/
-- administrator_designation.
drop function if exists public.register_hospital(
  text, text, text, text, text, text, text, text, text, text, text[], int, text, text, jsonb, text, text
);

drop function if exists public.resubmit_hospital_registration(
  uuid, text, text, text, text, text, text, text, text, text, text, text[], int, text, text, jsonb, text, text
);

create function public.register_hospital(
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
  p_certificates                jsonb
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
    certificates
  ) values (
    p_name, p_city, p_country, auth.uid(), 'pending',
    p_registration_type, p_registration_number, p_abn_number, p_address, p_zip_code, p_phone,
    p_contact_email, p_specialties, p_bed_count, p_license_number, p_accreditation_body,
    coalesce(p_certificates, '[]'::jsonb)
  )
  returning id into v_hospital_id;

  return v_hospital_id;
end;
$$;

revoke execute on function public.register_hospital from public;
grant execute on function public.register_hospital to authenticated;

create function public.resubmit_hospital_registration(
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
  p_certificates                jsonb
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
    status = 'pending',
    rejection_reason = null,
    more_info_message = null
  where id = p_hospital_id;
end;
$$;

revoke execute on function public.resubmit_hospital_registration from public;
grant execute on function public.resubmit_hospital_registration to authenticated;

alter table public.hospitals
  drop column if exists administrator_name,
  drop column if exists administrator_designation;
