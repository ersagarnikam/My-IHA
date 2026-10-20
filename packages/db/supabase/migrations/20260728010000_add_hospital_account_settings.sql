-- Hospital Account & Settings: notification preferences, plus write paths for
-- the Profile tab's two cards (Hospital Information, Hospital Details).
-- Mirrors 20260724120000_add_doctor_account_settings_fields.sql /
-- 20260724130000_split_doctor_profile_rpc.sql for doctors. Unlike doctors,
-- hospitals have no availability concept, so there's no equivalent tab or
-- schedule column here.
--
-- registration_number/abn_number/license_number are encrypted
-- (registration_number_enc/abn_number_enc/license_number_enc, see
-- 20260717000002_encrypt_hospital_doctor_credentials.sql) so they can't be
-- written via a plain client-side `.update()` — the two RPCs below are the
-- only write path for those columns, same as update_doctor_profile /
-- update_doctor_professional_details. The plain columns are included in the
-- same RPCs so the two Profile-tab cards can each save with a single call.

alter table public.hospitals
  add column if not exists email_notifications_enabled boolean not null default true,
  add column if not exists sms_notifications_enabled boolean not null default true;

create or replace function public.update_hospital_basic_info(
  p_name               text,
  p_registration_number text,
  p_abn_number          text,
  p_contact_email       text,
  p_phone               text,
  p_address             text,
  p_city                text,
  p_country             text,
  p_zip_code            text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.hospitals
  set name = p_name,
      registration_number_enc = public.encrypt_pii(p_registration_number),
      abn_number_enc = public.encrypt_pii(p_abn_number),
      contact_email = p_contact_email,
      phone = p_phone,
      address = p_address,
      city = p_city,
      country = p_country,
      zip_code = p_zip_code
  where user_id = auth.uid();
end;
$$;

revoke all on function public.update_hospital_basic_info(text, text, text, text, text, text, text, text, text) from public;
grant execute on function public.update_hospital_basic_info(text, text, text, text, text, text, text, text, text) to authenticated;

create or replace function public.update_hospital_details(
  p_registration_type  text,
  p_specialties        text[],
  p_bed_count          int,
  p_room_types         text[],
  p_license_number     text,
  p_accreditation_body text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.hospitals
  set registration_type = p_registration_type,
      specialties = p_specialties,
      bed_count = p_bed_count,
      room_types = coalesce(p_room_types, '{}'),
      license_number_enc = public.encrypt_pii(p_license_number),
      accreditation_body = p_accreditation_body
  where user_id = auth.uid();
end;
$$;

revoke all on function public.update_hospital_details(text, text[], int, text[], text, text) from public;
grant execute on function public.update_hospital_details(text, text[], int, text[], text, text) to authenticated;
