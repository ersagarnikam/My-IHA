-- The Account & Settings page edits Personal and Professional details as two
-- independently-savable cards (mirroring the patient portal's
-- Personal/Medical/Emergency split — see update_patient_personal_info /
-- update_patient_medical_background in
-- 20260717000001_encrypt_patient_demographics.sql). A single combined
-- update_doctor_profile RPC would force every save to re-validate fields the
-- user isn't touching (e.g. saving Professional Details would fail because
-- Personal Details' date_of_birth has never been filled in for any existing
-- doctor), so the original 9-param RPC is replaced by two RPCs scoped to
-- what each card actually edits. bio/languages_spoken/department/role are
-- plain columns already on `doctors` (added by
-- 20260714112706_add_doctor_registration_fields.sql /
-- 20260715140000_add_doctor_details_fields.sql). Hospital affiliations sync
-- the same way resubmit_doctor_registration does: delete-then-reinsert into
-- doctor_hospital_affiliations.

drop function if exists public.update_doctor_profile(text, text, text, date, text, text[], text, int, text);

create or replace function public.update_doctor_profile(
  p_full_name     text,
  p_contact_email text,
  p_contact_phone text,
  p_date_of_birth date,
  p_gender        text
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
      gender = p_gender
  where user_id = auth.uid();
end;
$$;

revoke all on function public.update_doctor_profile(text, text, text, date, text) from public;
grant execute on function public.update_doctor_profile(text, text, text, date, text) to authenticated;

create or replace function public.update_doctor_professional_details(
  p_specialties      text[],
  p_qualifications   text,
  p_years_experience int,
  p_license_number   text,
  p_bio              text,
  p_languages_spoken text[],
  p_department       text,
  p_role             text,
  p_hospital_ids     uuid[] default '{}'
)
returns void
language plpgsql
set search_path = ''
as $$
declare
  v_doctor_id uuid;
  v_hospital_id uuid;
begin
  select id into v_doctor_id from public.doctors where user_id = auth.uid();
  if v_doctor_id is null then
    raise exception 'doctor_not_found';
  end if;

  update public.doctors
  set specialties = p_specialties,
      qualifications = p_qualifications,
      years_experience = p_years_experience,
      license_number_enc = public.encrypt_pii(p_license_number),
      bio = p_bio,
      languages_spoken = p_languages_spoken,
      department = p_department,
      role = p_role
  where id = v_doctor_id;

  delete from public.doctor_hospital_affiliations where doctor_id = v_doctor_id;

  foreach v_hospital_id in array coalesce(p_hospital_ids, '{}') loop
    insert into public.doctor_hospital_affiliations (doctor_id, hospital_id)
    values (v_doctor_id, v_hospital_id)
    on conflict (doctor_id, hospital_id) do nothing;
  end loop;
end;
$$;

revoke all on function public.update_doctor_professional_details(
  text[], text, int, text, text, text[], text, text, uuid[]
) from public;
grant execute on function public.update_doctor_professional_details(
  text[], text, int, text, text, text[], text, text, uuid[]
) to authenticated;
