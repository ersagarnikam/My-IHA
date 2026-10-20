-- Reciprocal to 20260901020000_allow_provider_notifications_to_patients.sql
-- (providers -> patient). There was no policy at all allowing the patient
-- app to notify the lawyer assigned to their case — e.g. when a patient
-- uploads a document (in response to a request or otherwise), the lawyer
-- never finds out without manually re-checking the case. Same shape as
-- case_patient_user_id: a narrow insert policy scoped to *that case's own
-- assigned lawyer*, not an arbitrary user_id.

create or replace function public.case_lawyer_user_id(target_case_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select l.user_id
  from public.visa_submissions vs
  join public.lawyers l on l.id = vs.assigned_lawyer_id
  where vs.case_id = target_case_id;
$$;

create policy "Patients can notify the lawyer assigned to their case"
  on public.notifications for insert
  to authenticated
  with check (
    case_id is not null
    and user_id = public.case_lawyer_user_id(case_id)
    and exists (
      select 1 from public.cases c
      join public.patients p on p.id = c.patient_id
      where c.id = case_id and p.user_id = auth.uid()
    )
  );
