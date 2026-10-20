-- Encrypt cases.description (the patient-submitted case summary) at rest.
-- Same computed-column pattern as the patients migration.

alter table public.cases rename column description to description_enc;

alter table public.cases
  alter column description_enc type bytea using public.encrypt_pii(description_enc);

revoke select (description_enc) on public.cases from authenticated, anon;

create or replace function public.description(c public.cases)
returns text
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(c.description_enc) $$;

grant execute on function public.description(public.cases) to authenticated;

-- Write path: cases.insert RLS already checks patient_id ownership via
-- auth.uid(); this RPC just resolves patient_id the same way and encrypts
-- the description before insert.
create or replace function public.insert_case(
  p_specialty text,
  p_specialty_other text,
  p_description text
)
returns table (id uuid, reference_number text)
language plpgsql
set search_path = ''
as $$
declare
  v_patient_id uuid;
begin
  select p.id into v_patient_id
  from public.patients p
  where p.user_id = auth.uid();

  if v_patient_id is null then
    raise exception 'Unauthorized: patient not found';
  end if;

  return query
    insert into public.cases (patient_id, specialty, specialty_other, description_enc, status)
    values (v_patient_id, p_specialty, p_specialty_other, public.encrypt_pii(p_description), 'case_submitted')
    returning cases.id, cases.reference_number;
end;
$$;

revoke all on function public.insert_case(text, text, text) from public;
grant execute on function public.insert_case(text, text, text) to authenticated;
