-- ─────────────────────────────────────────────────────────
-- doctors.specialty/education/international_patients_count were leftover
-- demo-seed columns from the original treatments browsing table (Module
-- 03) and were dropped directly against the live database. specialty was
-- still written by register_doctor / resubmit_doctor_registration, so
-- every resubmit failed with "column \"specialty\" of relation \"doctors\"
-- does not exist" (42703). Codify all three drops here and stop the RPCs
-- from referencing specialty; `specialties` (text[]) is the sole source
-- of truth going forward.
-- ─────────────────────────────────────────────────────────
alter table public.doctors
  drop column if exists specialty,
  drop column if exists education,
  drop column if exists international_patients_count;

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
    languages_spoken, license_number, contact_email, contact_phone,
    department, role, working_days, certificates
  ) values (
    p_full_name, auth.uid(), 'pending',
    p_specialties, p_qualifications, p_years_experience, p_bio, p_photo_url,
    p_languages_spoken, p_license_number, p_contact_email, p_contact_phone,
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
    license_number = p_license_number,
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
