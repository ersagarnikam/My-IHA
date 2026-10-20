-- The "Doctors can view assigned patients" policy added in
-- 20260720130224_add_doctor_patient_access_policy.sql joins public.cases
-- directly inside a `patients` policy. That created a cycle: `cases` already
-- has a "Patients can view own cases" policy that subqueries `patients`, so
-- evaluating cases -> (subquery) patients -> (this policy) cases -> ... loops
-- forever ("infinite recursion detected in policy for relation cases",
-- Postgres 42P17) — breaking every query that touches `cases` for ANY
-- authenticated user (patients included), not just doctors.
--
-- Fix: move the cross-table check into a `security definer` function. Such a
-- function runs as its owner (the migration role, which bypasses RLS), so the
-- lookup inside it never re-triggers `cases`/`patients` row security and the
-- cycle is broken.

drop policy if exists "Doctors can view assigned patients" on public.patients;

create or replace function public.doctor_has_access_to_patient(target_patient_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.doctor_case_assignments dca
    join public.doctors d on d.id = dca.doctor_id
    join public.cases c on c.id = dca.case_id
    where c.patient_id = target_patient_id
      and d.user_id = auth.uid()
  );
$$;

create policy "Doctors can view assigned patients"
  on public.patients for select
  to authenticated
  using (public.doctor_has_access_to_patient(patients.id));
