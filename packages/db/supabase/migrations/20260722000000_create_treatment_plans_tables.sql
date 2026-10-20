-- Doctor treatment-plan authoring (module 05). Replaces the placeholder
-- introduced in 20260721020000_add_treatment_plan_submission.sql
-- (doctor_case_assignments.plan_submitted_at was just a bare timestamp with
-- no real plan data behind it) with the real treatment_plans schema, plus a
-- child table for third-party specialist cost line items.

create table public.treatment_plans (
  id                       uuid        primary key default gen_random_uuid(),
  case_id                  uuid        not null references public.cases (id) on delete cascade,
  doctor_id                uuid        not null references public.doctors (id) on delete cascade,
  status                   text        not null default 'draft',

  -- Diagnosis
  diagnosis                text,

  -- Treatment / Procedure
  treatment_type           text, -- medication_only | surgery | therapy
  procedure_name           text, -- doubles as the required "recommended treatment" field
  description              text,
  technique                text, -- e.g. "Minimally Invasive", "Robotic-Assisted"
  expected_outcome         text,
  success_rate             text, -- doctor's stated success rate for this procedure, e.g. "95%"

  -- Timeline & Recovery
  treatment_start_date      date,
  treatment_end_date        date,
  treatment_duration_days   int4 generated always as (treatment_end_date - treatment_start_date) stored,
  recovery_time             text,
  estimated_length_of_stay  text,

  -- Hospital Information
  hospital_id               uuid references public.hospitals (id),
  department                text,
  room_category             text,
  special_requirements      text,

  -- Cost Estimation. cost_breakdown holds the itemised doctor-entered
  -- extras (surgery charge, diagnostics & lab, anaesthesia, medication
  -- estimate, rehabilitation, ...) as { items: [{label, amount}], total } —
  -- same shape treatment_options.cost_breakdown already uses, so the total
  -- doesn't need a redundant persisted column.
  doctor_fees_aud           numeric(10,2),
  hospital_fees_aud         numeric(10,2),
  cost_breakdown            jsonb       not null default '{}',
  cost_notes                text,

  -- Doctor Notes
  patient_instructions      text,
  aftercare                 text[] not null default '{}', -- post-treatment care instructions, one per item

  submitted_at              timestamptz,
  created_at                timestamptz not null default now(),
  updated_at                timestamptz not null default now(),

  constraint treatment_plans_status_check check (status in (
    'draft', 'submitted_to_iha', 'iha_review_in_progress', 'iha_approved',
    'rejected_by_iha', 'presented_to_patient', 'patient_confirmed'
  )),
  constraint treatment_plans_treatment_type_check check (
    treatment_type is null or treatment_type in ('medication_only', 'surgery', 'therapy')
  ),
  constraint treatment_plans_case_doctor_key unique (case_id, doctor_id)
);

create table public.treatment_plan_specialists (
  id                uuid        primary key default gen_random_uuid(),
  treatment_plan_id uuid        not null references public.treatment_plans (id) on delete cascade,
  specialist_type   text        not null,
  specialist_name   text,
  cost_aud          numeric(10,2) not null check (cost_aud > 0),
  notes             text,
  created_at        timestamptz not null default now(),

  constraint treatment_plan_specialists_type_check check (specialist_type in (
    'anaesthetist', 'radiologist', 'pathologist', 'rehabilitation', 'other'
  ))
);

create index on public.treatment_plans (doctor_id);
create index on public.treatment_plans (case_id);
create index on public.treatment_plan_specialists (treatment_plan_id);

alter table public.treatment_plans enable row level security;
alter table public.treatment_plan_specialists enable row level security;

-- Doctor can always read their own plans, regardless of status.
create policy "Doctors can view own treatment plans"
  on public.treatment_plans for select
  to authenticated
  using (doctor_id in (select id from public.doctors where user_id = auth.uid()));

-- Insert requires an accepted assignment on the case (module 04/05: plan
-- creation only becomes available once a doctor has accepted the case).
create policy "Doctors can create treatment plans for accepted cases"
  on public.treatment_plans for insert
  to authenticated
  with check (
    doctor_id in (select id from public.doctors where user_id = auth.uid())
    and exists (
      select 1 from public.doctor_case_assignments dca
      where dca.case_id = treatment_plans.case_id
        and dca.doctor_id = treatment_plans.doctor_id
        and dca.status = 'accepted'
    )
  );

-- Update/delete only while still a draft — once submitted, only
-- submit_treatment_plan()/Admin-side RPCs (not built here) can move it
-- forward, same "RPC-only past a point of no return" pattern as `cases`.
create policy "Doctors can update own draft treatment plans"
  on public.treatment_plans for update
  to authenticated
  using (
    status = 'draft'
    and doctor_id in (select id from public.doctors where user_id = auth.uid())
  )
  with check (
    doctor_id in (select id from public.doctors where user_id = auth.uid())
  );

create policy "Doctors can delete own draft treatment plans"
  on public.treatment_plans for delete
  to authenticated
  using (
    status = 'draft'
    and doctor_id in (select id from public.doctors where user_id = auth.uid())
  );

create policy "Doctors can view own treatment plan specialists"
  on public.treatment_plan_specialists for select
  to authenticated
  using (
    exists (
      select 1 from public.treatment_plans tp
      join public.doctors d on d.id = tp.doctor_id
      where tp.id = treatment_plan_specialists.treatment_plan_id
        and d.user_id = auth.uid()
    )
  );

create policy "Doctors can manage specialists on own draft plans"
  on public.treatment_plan_specialists for all
  to authenticated
  using (
    exists (
      select 1 from public.treatment_plans tp
      join public.doctors d on d.id = tp.doctor_id
      where tp.id = treatment_plan_specialists.treatment_plan_id
        and d.user_id = auth.uid()
        and tp.status = 'draft'
    )
  )
  with check (
    exists (
      select 1 from public.treatment_plans tp
      join public.doctors d on d.id = tp.doctor_id
      where tp.id = treatment_plan_specialists.treatment_plan_id
        and d.user_id = auth.uid()
        and tp.status = 'draft'
    )
  );

-- ─────────────────────────────────────────────────────────
-- RPC: submit_treatment_plan
-- Validates ownership, draft status, and the required-fields gate (module
-- 05 validation rules) server-side, then locks the plan for client edits
-- and marks the assignment so the existing "Treatment Plan Sent" status
-- badge (case-row-status-badge.tsx) keeps working unchanged.
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
     or v_plan.diagnosis is null or length(v_plan.diagnosis) < 10
     or v_plan.procedure_name is null
     or v_plan.doctor_fees_aud is null or v_plan.doctor_fees_aud <= 0
     or v_plan.treatment_start_date is null
     or v_plan.treatment_end_date is null
     or v_plan.estimated_length_of_stay is null
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

-- The old stub is fully superseded — drop it so there's exactly one submit
-- path going forward.
drop function if exists public.submit_treatment_plan_to_admin(uuid);

-- ─────────────────────────────────────────────────────────
-- Simplify treatment_options to reference treatment_plans instead of
-- duplicating its content.
--
-- treatment_options.treatment_plan_id has existed since the original
-- treatment_tables migration but was left as a bare, unconstrained uuid
-- (database-schema.md: "vestigial, no treatment_plans table exists") —
-- every clinical/cost column on treatment_options was instead filled in
-- directly (duplicating what now lives on treatment_plans). Now that
-- treatment_plans is the real source of truth, treatment_options becomes a
-- thin row: which plan it prices, MTA's own commission on top of the
-- doctor's numbers, and publish/selection state. Diagnosis, procedure,
-- timeline, hospital/doctor identity, and cost breakdown are read by
-- joining to treatment_plans (packages/db/src/treatments.ts), not copied.
--
-- One plan produces at most one priced option (unique treatment_plan_id) —
-- this is also how multiple doctors on the same case fan out: each
-- accepted doctor has their own treatment_plans row (already unique per
-- case+doctor), MTA Admin approves and prices whichever of those it wants
-- to forward, and the patient ends up seeing one published treatment_
-- options row per approved plan to choose from — no schema change needed
-- for that, it falls out of the existing per-doctor treatment_plans rows.
--
-- Old demo rows have no backing treatment_plans row and can't satisfy the
-- new not-null/unique link — they were dev/demo fixtures (seeded directly
-- in 20260603000003/20260603000004), not real data, so they're dropped
-- rather than migrated.
delete from public.treatment_options where treatment_plan_id is null;

-- expected_outcome/technique/success_rate/aftercare are doctor-authored
-- (part of the treatment_plans submission above, not something Admin adds),
-- so they move there too rather than staying here.
alter table public.treatment_options
  drop column if exists hospital_id,
  drop column if exists doctor_id,
  drop column if exists treatment_summary,
  drop column if exists cost_breakdown,
  drop column if exists estimated_duration_days,
  drop column if exists estimated_timeline,
  drop column if exists pre_treatment_requirements,
  drop column if exists diagnosis,
  drop column if exists recommended_treatment,
  drop column if exists procedure_name,
  drop column if exists description,
  drop column if exists recovery_time,
  drop column if exists treatment_duration,
  drop column if exists hospital_stay,
  drop column if exists expected_outcome,
  drop column if exists technique,
  drop column if exists success_rate,
  drop column if exists aftercare,
  alter column treatment_plan_id set not null,
  add constraint treatment_options_treatment_plan_id_key unique (treatment_plan_id),
  add constraint treatment_options_treatment_plan_id_fkey
    foreign key (treatment_plan_id) references public.treatment_plans (id) on delete cascade,
  add column if not exists mta_commission_aud numeric(10,2) not null default 0;

comment on column public.treatment_options.mta_commission_aud is
  'The one thing Admin actually adds on top of the doctor''s submitted plan — everything else (diagnosis, procedure, cost items, expected outcome/technique/success rate/aftercare, hospital/doctor identity) is read via treatment_plan_id, not duplicated here.';
