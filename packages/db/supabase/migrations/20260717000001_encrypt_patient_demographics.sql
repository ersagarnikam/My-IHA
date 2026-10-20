-- Encrypt patient identity/medical fields at rest: full_name, date_of_birth,
-- allergies, current_medications, past_surgeries. Same computed-column
-- pattern as 20260622000002_encrypt_patients_pii.sql.

alter table public.patients rename column full_name to full_name_enc;
alter table public.patients rename column date_of_birth to date_of_birth_enc;
alter table public.patients rename column allergies to allergies_enc;
alter table public.patients rename column current_medications to current_medications_enc;
alter table public.patients rename column past_surgeries to past_surgeries_enc;

-- Defaults on the array columns are `'{}'::text[]`, incompatible with the
-- bytea target type — drop before the type change, replace with an
-- encrypted-empty-array default after.
alter table public.patients
  alter column allergies_enc drop default,
  alter column current_medications_enc drop default;

alter table public.patients
  alter column full_name_enc type bytea using public.encrypt_pii(full_name_enc),
  alter column date_of_birth_enc type bytea using public.encrypt_pii(date_of_birth_enc::text),
  alter column allergies_enc type bytea using public.encrypt_pii(allergies_enc::text),
  alter column current_medications_enc type bytea using public.encrypt_pii(current_medications_enc::text),
  alter column past_surgeries_enc type bytea using public.encrypt_pii(past_surgeries_enc);

alter table public.patients
  alter column allergies_enc set default public.encrypt_pii('{}'::text[]::text),
  alter column current_medications_enc set default public.encrypt_pii('{}'::text[]::text);

revoke select (
  full_name_enc,
  date_of_birth_enc,
  allergies_enc,
  current_medications_enc,
  past_surgeries_enc
) on public.patients from authenticated, anon;

create or replace function public.full_name(p public.patients)
returns text
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(p.full_name_enc) $$;

create or replace function public.date_of_birth(p public.patients)
returns date
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(p.date_of_birth_enc)::date $$;

create or replace function public.allergies(p public.patients)
returns text[]
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(p.allergies_enc)::text[] $$;

create or replace function public.current_medications(p public.patients)
returns text[]
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(p.current_medications_enc)::text[] $$;

create or replace function public.past_surgeries(p public.patients)
returns text
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(p.past_surgeries_enc) $$;

grant execute on function public.full_name(public.patients) to authenticated;
grant execute on function public.date_of_birth(public.patients) to authenticated;
grant execute on function public.allergies(public.patients) to authenticated;
grant execute on function public.current_medications(public.patients) to authenticated;
grant execute on function public.past_surgeries(public.patients) to authenticated;

-- Signup trigger: encrypt full_name before insert.
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

  insert into public.patients (user_id, full_name_enc)
  values (new.id, public.encrypt_pii(v_full_name))
  on conflict (user_id) do nothing;

  return new;
end;
$$;

-- Write paths — same RLS-scoped RPCs as before, now encrypting on the way in.

create or replace function public.update_patient_full_name(p_full_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(trim(p_full_name)) < 2 then
    return;
  end if;

  update public.patients
  set full_name_enc = public.encrypt_pii(trim(p_full_name))
  where user_id = auth.uid();
end;
$$;

revoke all on function public.update_patient_full_name(text) from public;
grant execute on function public.update_patient_full_name(text) to authenticated;

create or replace function public.update_patient_personal_info(
  p_full_name text,
  p_date_of_birth date,
  p_gender text,
  p_nationality text,
  p_country_of_residence text,
  p_phone text,
  p_address text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.patients
  set full_name_enc = public.encrypt_pii(p_full_name),
      date_of_birth_enc = public.encrypt_pii(p_date_of_birth::text),
      gender = p_gender,
      nationality = p_nationality,
      country_of_residence = p_country_of_residence,
      phone_enc = public.encrypt_pii(p_phone),
      address_enc = public.encrypt_pii(p_address)
  where user_id = auth.uid();
end;
$$;

revoke all on function public.update_patient_personal_info(text, date, text, text, text, text, text) from public;
grant execute on function public.update_patient_personal_info(text, date, text, text, text, text, text) to authenticated;

create or replace function public.update_patient_medical_background(
  p_medical_history text,
  p_allergies text[],
  p_current_medications text[],
  p_past_surgeries text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.patients
  set medical_history_enc = public.encrypt_pii(p_medical_history),
      allergies_enc = public.encrypt_pii(p_allergies::text),
      current_medications_enc = public.encrypt_pii(p_current_medications::text),
      past_surgeries_enc = public.encrypt_pii(p_past_surgeries)
  where user_id = auth.uid();
end;
$$;

revoke all on function public.update_patient_medical_background(text, text[], text[], text) from public;
grant execute on function public.update_patient_medical_background(text, text[], text[], text) to authenticated;
