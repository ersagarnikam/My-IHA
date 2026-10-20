-- Encrypt treatment plan data at rest: the clinical narrative fields on
-- treatment_plans, plus doctor_fees_aud/hospital_fees_aud/cost_breakdown
-- (and treatment_plan_specialists.specialist_name/cost_aud/notes) since this
-- is doctor-authored PHI/financial detail about a named patient's case, same
-- sensitivity class as cases.description and visa form_data. Same
-- computed-column pattern as those migrations: rename to `<name>_enc`
-- (bytea), expose a same-named SQL function as a PostgREST computed column
-- that decrypts on read, revoke select on the raw `_enc` column.
--
-- treatment_start_date/treatment_end_date stay plain — treatment_duration_days
-- is a generated column derived from them. status, treatment_type,
-- hospital_id/doctor_id/case_id, department, room_category, and timestamps
-- stay plain too (structural/queryable, not narrative content).
--
-- Write path: saveDraftTreatmentPlan currently does a raw client-side
-- .upsert()/.insert() (packages/db/src/treatment-plans.ts) — clients can no
-- longer encrypt client-side, so that whole draft-save flow moves to a new
-- save_treatment_plan_draft() RPC that re-derives doctor_id from auth.uid()
-- and replicates the authorization the RLS insert/update policies below no
-- longer meaningfully enforce for the encrypted columns.

alter table public.treatment_plans rename column diagnosis to diagnosis_enc;
alter table public.treatment_plans rename column procedure_name to procedure_name_enc;
alter table public.treatment_plans rename column description to description_enc;
alter table public.treatment_plans rename column technique to technique_enc;
alter table public.treatment_plans rename column expected_outcome to expected_outcome_enc;
alter table public.treatment_plans rename column success_rate to success_rate_enc;
alter table public.treatment_plans rename column recovery_time to recovery_time_enc;
alter table public.treatment_plans rename column estimated_length_of_stay to estimated_length_of_stay_enc;
alter table public.treatment_plans rename column special_requirements to special_requirements_enc;
alter table public.treatment_plans rename column doctor_fees_aud to doctor_fees_aud_enc;
alter table public.treatment_plans rename column hospital_fees_aud to hospital_fees_aud_enc;
alter table public.treatment_plans rename column cost_breakdown to cost_breakdown_enc;
alter table public.treatment_plans rename column cost_notes to cost_notes_enc;
alter table public.treatment_plans rename column patient_instructions to patient_instructions_enc;
alter table public.treatment_plans rename column aftercare to aftercare_enc;

-- Defaults on cost_breakdown_enc/aftercare_enc are '{}' literals of the old
-- types, incompatible with bytea — drop before the type change, same as the
-- patients/allergies migration.
alter table public.treatment_plans
  alter column cost_breakdown_enc drop default,
  alter column aftercare_enc drop default;

alter table public.treatment_plans
  alter column diagnosis_enc type bytea using public.encrypt_pii(diagnosis_enc),
  alter column procedure_name_enc type bytea using public.encrypt_pii(procedure_name_enc),
  alter column description_enc type bytea using public.encrypt_pii(description_enc),
  alter column technique_enc type bytea using public.encrypt_pii(technique_enc),
  alter column expected_outcome_enc type bytea using public.encrypt_pii(expected_outcome_enc),
  alter column success_rate_enc type bytea using public.encrypt_pii(success_rate_enc),
  alter column recovery_time_enc type bytea using public.encrypt_pii(recovery_time_enc),
  alter column estimated_length_of_stay_enc type bytea using public.encrypt_pii(estimated_length_of_stay_enc),
  alter column special_requirements_enc type bytea using public.encrypt_pii(special_requirements_enc),
  alter column doctor_fees_aud_enc type bytea using public.encrypt_pii(doctor_fees_aud_enc::text),
  alter column hospital_fees_aud_enc type bytea using public.encrypt_pii(hospital_fees_aud_enc::text),
  alter column cost_breakdown_enc type bytea using public.encrypt_pii(cost_breakdown_enc::text),
  alter column cost_notes_enc type bytea using public.encrypt_pii(cost_notes_enc),
  alter column patient_instructions_enc type bytea using public.encrypt_pii(patient_instructions_enc),
  alter column aftercare_enc type bytea using public.encrypt_pii(aftercare_enc::text);

alter table public.treatment_plans
  alter column cost_breakdown_enc set default public.encrypt_pii('{}'::jsonb::text),
  alter column aftercare_enc set default public.encrypt_pii('{}'::text[]::text);

revoke select (
  diagnosis_enc,
  procedure_name_enc,
  description_enc,
  technique_enc,
  expected_outcome_enc,
  success_rate_enc,
  recovery_time_enc,
  estimated_length_of_stay_enc,
  special_requirements_enc,
  doctor_fees_aud_enc,
  hospital_fees_aud_enc,
  cost_breakdown_enc,
  cost_notes_enc,
  patient_instructions_enc,
  aftercare_enc
) on public.treatment_plans from authenticated, anon;

create or replace function public.diagnosis(tp public.treatment_plans)
returns text language sql stable set search_path = ''
as $$ select public.decrypt_pii(tp.diagnosis_enc) $$;

create or replace function public.procedure_name(tp public.treatment_plans)
returns text language sql stable set search_path = ''
as $$ select public.decrypt_pii(tp.procedure_name_enc) $$;

create or replace function public.description(tp public.treatment_plans)
returns text language sql stable set search_path = ''
as $$ select public.decrypt_pii(tp.description_enc) $$;

create or replace function public.technique(tp public.treatment_plans)
returns text language sql stable set search_path = ''
as $$ select public.decrypt_pii(tp.technique_enc) $$;

create or replace function public.expected_outcome(tp public.treatment_plans)
returns text language sql stable set search_path = ''
as $$ select public.decrypt_pii(tp.expected_outcome_enc) $$;

create or replace function public.success_rate(tp public.treatment_plans)
returns text language sql stable set search_path = ''
as $$ select public.decrypt_pii(tp.success_rate_enc) $$;

create or replace function public.recovery_time(tp public.treatment_plans)
returns text language sql stable set search_path = ''
as $$ select public.decrypt_pii(tp.recovery_time_enc) $$;

create or replace function public.estimated_length_of_stay(tp public.treatment_plans)
returns text language sql stable set search_path = ''
as $$ select public.decrypt_pii(tp.estimated_length_of_stay_enc) $$;

create or replace function public.special_requirements(tp public.treatment_plans)
returns text language sql stable set search_path = ''
as $$ select public.decrypt_pii(tp.special_requirements_enc) $$;

create or replace function public.doctor_fees_aud(tp public.treatment_plans)
returns numeric language sql stable set search_path = ''
as $$ select public.decrypt_pii(tp.doctor_fees_aud_enc)::numeric $$;

create or replace function public.hospital_fees_aud(tp public.treatment_plans)
returns numeric language sql stable set search_path = ''
as $$ select public.decrypt_pii(tp.hospital_fees_aud_enc)::numeric $$;

create or replace function public.cost_breakdown(tp public.treatment_plans)
returns jsonb language sql stable set search_path = ''
as $$
  select case
    when tp.cost_breakdown_enc is null then null
    else public.decrypt_pii(tp.cost_breakdown_enc)::jsonb
  end;
$$;

create or replace function public.cost_notes(tp public.treatment_plans)
returns text language sql stable set search_path = ''
as $$ select public.decrypt_pii(tp.cost_notes_enc) $$;

create or replace function public.patient_instructions(tp public.treatment_plans)
returns text language sql stable set search_path = ''
as $$ select public.decrypt_pii(tp.patient_instructions_enc) $$;

create or replace function public.aftercare(tp public.treatment_plans)
returns text[] language sql stable set search_path = ''
as $$
  select case
    when tp.aftercare_enc is null then null
    else public.decrypt_pii(tp.aftercare_enc)::text[]
  end;
$$;

grant execute on function public.diagnosis(public.treatment_plans) to authenticated;
grant execute on function public.procedure_name(public.treatment_plans) to authenticated;
grant execute on function public.description(public.treatment_plans) to authenticated;
grant execute on function public.technique(public.treatment_plans) to authenticated;
grant execute on function public.expected_outcome(public.treatment_plans) to authenticated;
grant execute on function public.success_rate(public.treatment_plans) to authenticated;
grant execute on function public.recovery_time(public.treatment_plans) to authenticated;
grant execute on function public.estimated_length_of_stay(public.treatment_plans) to authenticated;
grant execute on function public.special_requirements(public.treatment_plans) to authenticated;
grant execute on function public.doctor_fees_aud(public.treatment_plans) to authenticated;
grant execute on function public.hospital_fees_aud(public.treatment_plans) to authenticated;
grant execute on function public.cost_breakdown(public.treatment_plans) to authenticated;
grant execute on function public.cost_notes(public.treatment_plans) to authenticated;
grant execute on function public.patient_instructions(public.treatment_plans) to authenticated;
grant execute on function public.aftercare(public.treatment_plans) to authenticated;

-- ─────────────────────────────────────────────────────────
-- treatment_plan_specialists: same treatment for specialist_name/cost_aud/
-- notes. The `cost_aud > 0` check constraint can't run against an opaque
-- bytea, so it's dropped here and re-enforced in save_treatment_plan_draft()
-- below instead.
-- ─────────────────────────────────────────────────────────

alter table public.treatment_plan_specialists
  drop constraint if exists treatment_plan_specialists_cost_aud_check;

alter table public.treatment_plan_specialists rename column specialist_name to specialist_name_enc;
alter table public.treatment_plan_specialists rename column cost_aud to cost_aud_enc;
alter table public.treatment_plan_specialists rename column notes to notes_enc;

alter table public.treatment_plan_specialists
  alter column specialist_name_enc type bytea using public.encrypt_pii(specialist_name_enc),
  alter column cost_aud_enc type bytea using public.encrypt_pii(cost_aud_enc::text),
  alter column notes_enc type bytea using public.encrypt_pii(notes_enc);

revoke select (specialist_name_enc, cost_aud_enc, notes_enc)
  on public.treatment_plan_specialists from authenticated, anon;

create or replace function public.specialist_name(s public.treatment_plan_specialists)
returns text language sql stable set search_path = ''
as $$ select public.decrypt_pii(s.specialist_name_enc) $$;

create or replace function public.cost_aud(s public.treatment_plan_specialists)
returns numeric language sql stable set search_path = ''
as $$ select public.decrypt_pii(s.cost_aud_enc)::numeric $$;

create or replace function public.notes(s public.treatment_plan_specialists)
returns text language sql stable set search_path = ''
as $$ select public.decrypt_pii(s.notes_enc) $$;

grant execute on function public.specialist_name(public.treatment_plan_specialists) to authenticated;
grant execute on function public.cost_aud(public.treatment_plan_specialists) to authenticated;
grant execute on function public.notes(public.treatment_plan_specialists) to authenticated;

-- ─────────────────────────────────────────────────────────
-- RPC: save_treatment_plan_draft
-- Replaces the client-side upsert(treatment_plans) + delete/insert
-- (treatment_plan_specialists) in saveDraftTreatmentPlan
-- (packages/db/src/treatment-plans.ts) now that those columns are
-- encrypted and clients can't populate `_enc` bytea columns themselves.
-- doctor_id is re-derived from auth.uid() (never trusted from the client),
-- and this replicates the authorization the original RLS insert/update
-- policies expressed: doctor owns an *accepted* assignment on the case, and
-- an existing plan can only be overwritten while still a draft.
-- ─────────────────────────────────────────────────────────
create or replace function public.save_treatment_plan_draft(
  p_case_id                  uuid,
  p_diagnosis                text,
  p_treatment_type           text,
  p_procedure_name           text,
  p_description              text,
  p_technique                text,
  p_expected_outcome         text,
  p_success_rate             text,
  p_treatment_start_date     date,
  p_treatment_end_date       date,
  p_recovery_time            text,
  p_estimated_length_of_stay text,
  p_hospital_id              uuid,
  p_department               text,
  p_room_category            text,
  p_special_requirements     text,
  p_doctor_fees_aud          numeric,
  p_hospital_fees_aud        numeric,
  p_cost_breakdown           jsonb,
  p_cost_notes               text,
  p_patient_instructions     text,
  p_aftercare                text[],
  p_specialists              jsonb -- array of {specialist_type, specialist_name, cost_aud, notes}
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doctor_id       uuid;
  v_plan_id         uuid;
  v_existing_status text;
  v_specialist      jsonb;
begin
  select id into v_doctor_id from public.doctors where user_id = auth.uid();
  if v_doctor_id is null then
    raise exception 'unauthorized';
  end if;

  if not exists (
    select 1 from public.doctor_case_assignments
    where case_id = p_case_id and doctor_id = v_doctor_id and status = 'accepted'
  ) then
    raise exception 'unauthorized';
  end if;

  select status into v_existing_status
  from public.treatment_plans
  where case_id = p_case_id and doctor_id = v_doctor_id;

  if v_existing_status is not null and v_existing_status != 'draft' then
    raise exception 'invalid_transition';
  end if;

  insert into public.treatment_plans (
    case_id, doctor_id,
    diagnosis_enc, treatment_type, procedure_name_enc, description_enc, technique_enc,
    expected_outcome_enc, success_rate_enc,
    treatment_start_date, treatment_end_date,
    recovery_time_enc, estimated_length_of_stay_enc,
    hospital_id, department, room_category, special_requirements_enc,
    doctor_fees_aud_enc, hospital_fees_aud_enc, cost_breakdown_enc, cost_notes_enc,
    patient_instructions_enc, aftercare_enc
  ) values (
    p_case_id, v_doctor_id,
    public.encrypt_pii(p_diagnosis), p_treatment_type, public.encrypt_pii(p_procedure_name),
    public.encrypt_pii(p_description), public.encrypt_pii(p_technique),
    public.encrypt_pii(p_expected_outcome), public.encrypt_pii(p_success_rate),
    p_treatment_start_date, p_treatment_end_date,
    public.encrypt_pii(p_recovery_time), public.encrypt_pii(p_estimated_length_of_stay),
    p_hospital_id, p_department, p_room_category, public.encrypt_pii(p_special_requirements),
    public.encrypt_pii(p_doctor_fees_aud::text), public.encrypt_pii(p_hospital_fees_aud::text),
    public.encrypt_pii(coalesce(p_cost_breakdown, '{}'::jsonb)::text), public.encrypt_pii(p_cost_notes),
    public.encrypt_pii(p_patient_instructions), public.encrypt_pii(coalesce(p_aftercare, '{}')::text)
  )
  on conflict (case_id, doctor_id) do update set
    diagnosis_enc                = excluded.diagnosis_enc,
    treatment_type                = excluded.treatment_type,
    procedure_name_enc            = excluded.procedure_name_enc,
    description_enc                = excluded.description_enc,
    technique_enc                  = excluded.technique_enc,
    expected_outcome_enc          = excluded.expected_outcome_enc,
    success_rate_enc               = excluded.success_rate_enc,
    treatment_start_date          = excluded.treatment_start_date,
    treatment_end_date             = excluded.treatment_end_date,
    recovery_time_enc              = excluded.recovery_time_enc,
    estimated_length_of_stay_enc  = excluded.estimated_length_of_stay_enc,
    hospital_id                    = excluded.hospital_id,
    department                     = excluded.department,
    room_category                  = excluded.room_category,
    special_requirements_enc      = excluded.special_requirements_enc,
    doctor_fees_aud_enc            = excluded.doctor_fees_aud_enc,
    hospital_fees_aud_enc          = excluded.hospital_fees_aud_enc,
    cost_breakdown_enc              = excluded.cost_breakdown_enc,
    cost_notes_enc                  = excluded.cost_notes_enc,
    patient_instructions_enc       = excluded.patient_instructions_enc,
    aftercare_enc                   = excluded.aftercare_enc,
    updated_at                      = now()
  returning id into v_plan_id;

  delete from public.treatment_plan_specialists where treatment_plan_id = v_plan_id;

  for v_specialist in select * from jsonb_array_elements(coalesce(p_specialists, '[]'::jsonb))
  loop
    if (v_specialist->>'cost_aud')::numeric <= 0 then
      raise exception 'invalid_specialist_cost';
    end if;

    insert into public.treatment_plan_specialists (
      treatment_plan_id, specialist_type, specialist_name_enc, cost_aud_enc, notes_enc
    ) values (
      v_plan_id,
      v_specialist->>'specialist_type',
      public.encrypt_pii(v_specialist->>'specialist_name'),
      public.encrypt_pii(v_specialist->>'cost_aud'),
      public.encrypt_pii(v_specialist->>'notes')
    );
  end loop;

  return v_plan_id;
end;
$$;

revoke all on function public.save_treatment_plan_draft(
  uuid, text, text, text, text, text, text, text, date, date, text, text,
  uuid, text, text, text, numeric, numeric, jsonb, text, text, text[], jsonb
) from public;
grant execute on function public.save_treatment_plan_draft(
  uuid, text, text, text, text, text, text, text, date, date, text, text,
  uuid, text, text, text, numeric, numeric, jsonb, text, text, text[], jsonb
) to authenticated;

-- ─────────────────────────────────────────────────────────
-- submit_treatment_plan() (20260721020000) reads v_plan.diagnosis/
-- procedure_name/doctor_fees_aud/estimated_length_of_stay directly off the
-- row it selected — those are now `_enc` bytea columns with no plain
-- attribute of the old name, and the function runs with `search_path = ''`
-- so it can't rely on the computed-column dot-call sugar finding
-- public.diagnosis(...) implicitly. Re-created with the same signature,
-- decrypting explicitly and fully-qualified instead.
-- ─────────────────────────────────────────────────────────
create or replace function public.submit_treatment_plan(p_plan_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor_id uuid;
  v_plan      public.treatment_plans;
begin
  select id into v_doctor_id from public.doctors where user_id = auth.uid();
  if v_doctor_id is null then
    raise exception 'unauthorized';
  end if;

  select * into v_plan
  from public.treatment_plans
  where id = p_plan_id and doctor_id = v_doctor_id;

  if v_plan.id is null then
    raise exception 'plan_not_found';
  end if;

  if v_plan.status != 'draft' then
    raise exception 'invalid_transition';
  end if;

  if v_plan.hospital_id is null
     or public.decrypt_pii(v_plan.diagnosis_enc) is null or length(public.decrypt_pii(v_plan.diagnosis_enc)) < 10
     or public.decrypt_pii(v_plan.procedure_name_enc) is null
     or public.decrypt_pii(v_plan.doctor_fees_aud_enc) is null or public.decrypt_pii(v_plan.doctor_fees_aud_enc)::numeric <= 0
     or v_plan.treatment_start_date is null
     or v_plan.treatment_end_date is null
     or public.decrypt_pii(v_plan.estimated_length_of_stay_enc) is null
     or v_plan.treatment_type is null then
    raise exception 'missing_required_fields';
  end if;

  update public.treatment_plans
  set status = 'submitted_to_iha', submitted_at = now(), updated_at = now()
  where id = p_plan_id;

  update public.doctor_case_assignments
  set plan_submitted_at = now()
  where case_id = v_plan.case_id and doctor_id = v_doctor_id;
end;
$$;

revoke all on function public.submit_treatment_plan(uuid) from public;
grant execute on function public.submit_treatment_plan(uuid) to authenticated;
