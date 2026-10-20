-- Encrypt sensitive patient PII at rest: phone, address, medical_history,
-- and emergency contact fields.
--
-- Pattern: rename the real column to `<name>_enc` (bytea, ciphertext) and
-- expose a same-named SQL function as a PostgREST computed column that
-- decrypts on read. This keeps every existing `.select('phone')` /
-- `.select('address')` etc. working unchanged. Writes move to RPCs since
-- clients can no longer encrypt client-side.

alter table public.patients rename column phone to phone_enc;
alter table public.patients rename column address to address_enc;
alter table public.patients rename column medical_history to medical_history_enc;
alter table public.patients rename column emergency_contact_name to emergency_contact_name_enc;
alter table public.patients rename column emergency_contact_phone to emergency_contact_phone_enc;
alter table public.patients rename column emergency_contact_relationship to emergency_contact_relationship_enc;

alter table public.patients
  alter column phone_enc type bytea using public.encrypt_pii(phone_enc),
  alter column address_enc type bytea using public.encrypt_pii(address_enc),
  alter column medical_history_enc type bytea using public.encrypt_pii(medical_history_enc),
  alter column emergency_contact_name_enc type bytea using public.encrypt_pii(emergency_contact_name_enc),
  alter column emergency_contact_phone_enc type bytea using public.encrypt_pii(emergency_contact_phone_enc),
  alter column emergency_contact_relationship_enc type bytea using public.encrypt_pii(emergency_contact_relationship_enc);

revoke select (
  phone_enc,
  address_enc,
  medical_history_enc,
  emergency_contact_name_enc,
  emergency_contact_phone_enc,
  emergency_contact_relationship_enc
) on public.patients from authenticated, anon;

create or replace function public.phone(p public.patients)
returns text
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(p.phone_enc) $$;

create or replace function public.address(p public.patients)
returns text
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(p.address_enc) $$;

create or replace function public.medical_history(p public.patients)
returns text
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(p.medical_history_enc) $$;

create or replace function public.emergency_contact_name(p public.patients)
returns text
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(p.emergency_contact_name_enc) $$;

create or replace function public.emergency_contact_phone(p public.patients)
returns text
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(p.emergency_contact_phone_enc) $$;

create or replace function public.emergency_contact_relationship(p public.patients)
returns text
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(p.emergency_contact_relationship_enc) $$;

grant execute on function public.phone(public.patients) to authenticated;
grant execute on function public.address(public.patients) to authenticated;
grant execute on function public.medical_history(public.patients) to authenticated;
grant execute on function public.emergency_contact_name(public.patients) to authenticated;
grant execute on function public.emergency_contact_phone(public.patients) to authenticated;
grant execute on function public.emergency_contact_relationship(public.patients) to authenticated;

-- Write paths: RLS already restricts these to the owning patient
-- (auth.uid() = user_id), so plain SECURITY INVOKER functions are enough.

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
  set full_name = p_full_name,
      date_of_birth = p_date_of_birth,
      gender = p_gender,
      nationality = p_nationality,
      country_of_residence = p_country_of_residence,
      phone_enc = public.encrypt_pii(p_phone),
      address_enc = public.encrypt_pii(p_address)
  where user_id = auth.uid();
end;
$$;

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
      allergies = p_allergies,
      current_medications = p_current_medications,
      past_surgeries = p_past_surgeries
  where user_id = auth.uid();
end;
$$;

create or replace function public.update_patient_emergency_contact(
  p_emergency_contact_name text,
  p_emergency_contact_relationship text,
  p_emergency_contact_phone text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.patients
  set emergency_contact_name_enc = public.encrypt_pii(p_emergency_contact_name),
      emergency_contact_relationship_enc = public.encrypt_pii(p_emergency_contact_relationship),
      emergency_contact_phone_enc = public.encrypt_pii(p_emergency_contact_phone)
  where user_id = auth.uid();
end;
$$;

revoke all on function public.update_patient_personal_info(text, date, text, text, text, text, text) from public;
revoke all on function public.update_patient_medical_background(text, text[], text[], text) from public;
revoke all on function public.update_patient_emergency_contact(text, text, text) from public;

grant execute on function public.update_patient_personal_info(text, date, text, text, text, text, text) to authenticated;
grant execute on function public.update_patient_medical_background(text, text[], text[], text) to authenticated;
grant execute on function public.update_patient_emergency_contact(text, text, text) to authenticated;
