-- Hospital Portal: Doctor Management / Patient Management / Case Management.
-- `doctor_hospital_affiliations` and `doctors` already grant blanket
-- authenticated SELECT (see 20260714112707 / 20260603000003), so a hospital
-- account can already list its affiliated doctors. But `doctor_case_assignments`,
-- `cases`, and `patients` are scoped to the assigned doctor only (see
-- 20260717131615 / 20260717131616 / 20260720140000) — this migration adds the
-- hospital-scoped read paths, mirroring the doctor_has_access_to_patient
-- security-definer pattern from 20260720140000_fix_doctor_patient_policy_recursion.sql
-- to keep the cases/patients checks recursion-safe.

create policy "Hospitals can view assigned-doctor case assignments"
  on public.doctor_case_assignments for select
  to authenticated
  using (
    doctor_id in (
      select dha.doctor_id
      from public.doctor_hospital_affiliations dha
      join public.hospitals h on h.id = dha.hospital_id
      where h.user_id = auth.uid()
    )
  );

create or replace function public.hospital_has_access_to_case(target_case_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.doctor_case_assignments dca
    join public.doctor_hospital_affiliations dha on dha.doctor_id = dca.doctor_id
    join public.hospitals h on h.id = dha.hospital_id
    where dca.case_id = target_case_id and h.user_id = auth.uid()
  );
$$;

create policy "Hospitals can view cases assigned to affiliated doctors"
  on public.cases for select
  to authenticated
  using (public.hospital_has_access_to_case(cases.id));

create or replace function public.hospital_has_access_to_patient(target_patient_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.doctor_case_assignments dca
    join public.doctor_hospital_affiliations dha on dha.doctor_id = dca.doctor_id
    join public.hospitals h on h.id = dha.hospital_id
    join public.cases c on c.id = dca.case_id
    where c.patient_id = target_patient_id and h.user_id = auth.uid()
  );
$$;

create policy "Hospitals can view patients of affiliated doctors' cases"
  on public.patients for select
  to authenticated
  using (public.hospital_has_access_to_patient(patients.id));
