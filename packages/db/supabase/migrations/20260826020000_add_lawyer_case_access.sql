-- ─────────────────────────────────────────────────────────
-- Visa Lawyer Portal: lawyer read access to assigned cases (Module 03 start)
-- assigned_lawyer_id has existed unconstrained on visa_submissions since
-- 20260603000006_create_visa_tables.sql (no lawyers table existed yet).
-- Now that lawyers exists (20260826010000), add the FK and grant lawyers
-- read access to their assigned case/patient rows — mirrors the
-- hospital_has_access_to_case/_patient security-definer pattern from
-- 20260728030000_add_hospital_case_patient_access.sql, joining through
-- assigned_lawyer_id instead of doctor_hospital_affiliations.
-- ─────────────────────────────────────────────────────────

alter table public.visa_submissions
  add constraint visa_submissions_assigned_lawyer_id_fkey
  foreign key (assigned_lawyer_id) references public.lawyers (id);

create policy "Lawyers can view their assigned visa submissions"
  on public.visa_submissions for select
  to authenticated
  using (assigned_lawyer_id = (select id from public.lawyers where user_id = auth.uid()));

create or replace function public.lawyer_has_access_to_case(target_case_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.visa_submissions vs
    join public.lawyers l on l.id = vs.assigned_lawyer_id
    where vs.case_id = target_case_id and l.user_id = auth.uid()
  );
$$;

create policy "Lawyers can view cases assigned to them"
  on public.cases for select
  to authenticated
  using (public.lawyer_has_access_to_case(cases.id));

create or replace function public.lawyer_has_access_to_patient(target_patient_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.visa_submissions vs
    join public.lawyers l on l.id = vs.assigned_lawyer_id
    where vs.patient_id = target_patient_id and l.user_id = auth.uid()
  );
$$;

create policy "Lawyers can view patients of their assigned cases"
  on public.patients for select
  to authenticated
  using (public.lawyer_has_access_to_patient(patients.id));
