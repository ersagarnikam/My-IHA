-- ─────────────────────────────────────────────────────────
-- Fix: on_auth_user_created_patient fired for every auth.users insert from
-- any app, including the hospital app's doctor/hospital registration wizard
-- — so doctor/hospital signups also got a stray public.patients row (with
-- no corresponding cleanup), silently mislabeling them as patients.
--
-- The hospital app's signUpForRegistration() now passes
-- options.data.role = 'doctor' | 'hospital' to auth.signUp(), so
-- new.raw_user_meta_data ->> 'role' is a reliable discriminator. Only skip
-- the patients insert when a role is explicitly present and isn't
-- 'patient' — the patient app's own signup never sets this field, so its
-- behavior is unchanged.
-- ─────────────────────────────────────────────────────────
create or replace function public.handle_new_patient_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text;
  v_role text;
begin
  v_role := new.raw_user_meta_data ->> 'role';
  if v_role is not null and v_role <> 'patient' then
    return new;
  end if;

  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'fullName'), ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );

  if v_full_name = '' then
    v_full_name := 'Patient';
  end if;

  insert into public.patients (user_id, full_name)
  values (new.id, v_full_name)
  on conflict (user_id) do nothing;

  return new;
end;
$$;
