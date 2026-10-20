-- The hospital's Case Management view is collapsing its status tabs down to
-- Awaiting Patient / Treatment Confirmed / Completed / Declined, where
-- "Declined" means IHA rejected the doctor's treatment plan
-- (treatment_plans.status = 'rejected_by_iha'). treatment_plans' own RLS
-- only lets the owning doctor select it (20260722000000), so — same reason
-- hospital_has_access_to_case/_assignment below are security-definer rather
-- than inline exists() — a hospital-run query against treatment_plans would
-- always see zero rows. This is a bulk, table-returning sibling of
-- hospital_has_access_to_assignment: instead of a per-row boolean it returns
-- every (case_id, doctor_id, status) the hospital has legitimate access to,
-- so the case-management list can bucket every row in one round trip.

create or replace function public.hospital_treatment_plan_statuses(p_hospital_id uuid)
returns table (case_id uuid, doctor_id uuid, status text)
language sql
security definer
set search_path = public
stable
as $$
  select tp.case_id, tp.doctor_id, tp.status
  from public.treatment_plans tp
  join public.hospitals h on h.id = tp.hospital_id
  where tp.hospital_id = p_hospital_id
    and tp.status != 'draft'
    and h.user_id = auth.uid();
$$;

revoke all on function public.hospital_treatment_plan_statuses(uuid) from public;
grant execute on function public.hospital_treatment_plan_statuses(uuid) to authenticated;
