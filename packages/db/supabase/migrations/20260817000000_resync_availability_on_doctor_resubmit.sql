-- Bug: doctors.working_days (set at registration/resubmission) and
-- doctors.availability_schedule (set when the Availability tab is saved) can
-- drift. Once availability_schedule is non-empty it permanently overrides
-- working_days for display (see deriveAvailabilityFromWorkingDays in
-- apps/doctor/lib/data/account-settings.ts and
-- apps/hospital/lib/data/doctor-management.ts, which only derive from
-- working_days while availability_schedule is empty). resubmit_doctor_registration
-- updates working_days but never touched availability_schedule, so a doctor
-- who resubmits with a new set of working days (e.g. Mon-Fri) after having
-- already saved an Availability tab (e.g. Mon-Sat) would keep seeing the
-- stale Mon-Sat schedule. Resetting availability_schedule here makes
-- working_days authoritative again on every resubmission, so the tab
-- re-derives from the freshly submitted days instead of showing stale data.

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
    availability_schedule = '[]'::jsonb,
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
