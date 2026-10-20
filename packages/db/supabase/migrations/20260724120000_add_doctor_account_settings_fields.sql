-- Doctor Account & Settings: date of birth, gender, notification preferences,
-- and a weekly availability schedule. `date_of_birth` follows the same
-- encrypted-column + decrypted-computed-column pattern as
-- 20260717000001_encrypt_patient_demographics.sql /
-- 20260717000002_encrypt_hospital_doctor_credentials.sql. The other new
-- columns are plain (not PII in the same sense as patients.gender, which is
-- also stored unencrypted).

alter table public.doctors
  add column if not exists date_of_birth_enc bytea,
  add column if not exists gender text,
  add column if not exists email_notifications_enabled boolean not null default true,
  add column if not exists sms_notifications_enabled boolean not null default false,
  -- Empty until the doctor first saves the Availability tab — the initial
  -- values shown there are derived client-side from `working_days` (set at
  -- registration), not from a hardcoded schedule. See
  -- deriveAvailabilityFromWorkingDays in apps/hospital/lib/data/account-settings.ts.
  add column if not exists availability_schedule jsonb not null default '[]'::jsonb;

revoke select (date_of_birth_enc) on public.doctors from authenticated, anon;

create or replace function public.date_of_birth(d public.doctors)
returns date
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(d.date_of_birth_enc)::date $$;

grant execute on function public.date_of_birth(public.doctors) to authenticated;

-- Write path for the encrypted fields (date_of_birth, license_number) plus the
-- rest of the editable Profile-tab fields in one call. Mirrors
-- update_patient_personal_info's shape: RLS already lets a doctor update their
-- own row (see "Doctors can update own account row"), but the client can't
-- produce the license_number/date_of_birth ciphertext itself, so those two
-- fields must go through this RPC rather than a direct .update().
create or replace function public.update_doctor_profile(
  p_full_name        text,
  p_contact_email    text,
  p_contact_phone    text,
  p_date_of_birth    date,
  p_gender           text,
  p_specialties      text[],
  p_qualifications   text,
  p_years_experience int,
  p_license_number   text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.doctors
  set full_name = p_full_name,
      contact_email = p_contact_email,
      contact_phone = p_contact_phone,
      date_of_birth_enc = public.encrypt_pii(p_date_of_birth::text),
      gender = p_gender,
      specialties = p_specialties,
      qualifications = p_qualifications,
      years_experience = p_years_experience,
      license_number_enc = public.encrypt_pii(p_license_number)
  where user_id = auth.uid();
end;
$$;

revoke all on function public.update_doctor_profile(text, text, text, date, text, text[], text, int, text) from public;
grant execute on function public.update_doctor_profile(text, text, text, date, text, text[], text, int, text) to authenticated;
