-- 20260728030000 granted a hospital read access to a case/patient the moment
-- the doctor had ANY affiliation row with that hospital — i.e. every hospital
-- a doctor is affiliated with saw every one of that doctor's cases, even ones
-- that hospital had nothing to do with. That contradicts module docs
-- 03-doctor-profile-management ("affiliation... not a hospital granting
-- access") and 04-case-management ("hospitals don't receive cases directly").
--
-- The correct grant is narrower: a hospital should only see a case/patient
-- once the doctor has built and submitted a treatment plan ([[05-treatment-
-- plan-creation]]) that names that specific hospital
-- (treatment_plans.hospital_id) — mirroring how 08-visa-document-generation
-- already scopes hospital access to "the hospital selected on the
-- confirmed... plan", not blanket affiliation. `status <> 'draft'` (set only
-- by submit_treatment_plan()) is used rather than a point-in-time flag so
-- access reflects the plan's current state if it's later sent back to draft.

drop policy if exists "Hospitals can view assigned-doctor case assignments" on public.doctor_case_assignments;

-- Security-definer (not an inline exists()) for the same reason
-- hospital_has_access_to_case/_patient below are: treatment_plans' own RLS
-- only lets the owning doctor select it, so an inline subquery run as the
-- querying (hospital) role would see zero treatment_plans rows and always
-- evaluate false, regardless of a matching plan actually existing.
create or replace function public.hospital_has_access_to_assignment(target_case_id uuid, target_doctor_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.treatment_plans tp
    join public.hospitals h on h.id = tp.hospital_id
    where tp.case_id = target_case_id
      and tp.doctor_id = target_doctor_id
      and tp.status != 'draft'
      and h.user_id = auth.uid()
  );
$$;

create policy "Hospitals can view assignments for their treatment plans"
  on public.doctor_case_assignments for select
  to authenticated
  using (public.hospital_has_access_to_assignment(case_id, doctor_id));

create or replace function public.hospital_has_access_to_case(target_case_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.treatment_plans tp
    join public.hospitals h on h.id = tp.hospital_id
    where tp.case_id = target_case_id
      and tp.status != 'draft'
      and h.user_id = auth.uid()
  );
$$;

create or replace function public.hospital_has_access_to_patient(target_patient_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.treatment_plans tp
    join public.hospitals h on h.id = tp.hospital_id
    join public.cases c on c.id = tp.case_id
    where c.patient_id = target_patient_id
      and tp.status != 'draft'
      and h.user_id = auth.uid()
  );
$$;
