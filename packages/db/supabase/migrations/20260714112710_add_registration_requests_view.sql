-- ─────────────────────────────────────────────────────────
-- registration_requests
-- Queue for the (unbuilt) Admin Portal's "Total Requests" dashboard —
-- modeled as a view over hospitals/doctors rather than a separate table,
-- since it's a projection of existing rows, not new state. Uses
-- security_invoker so it enforces the querying role's own RLS/grants rather
-- than the view owner's; no grants to anon/authenticated are added here, so
-- in practice only the service role (used by the future Admin Portal) can
-- read it.
-- ─────────────────────────────────────────────────────────
create view public.registration_requests
with (security_invoker = true) as
  select
    id,
    'hospital'::text as kind,
    name as display_name,
    status,
    created_at,
    rejection_reason,
    more_info_message
  from public.hospitals
  where status = 'pending'
  union all
  select
    id,
    'doctor'::text as kind,
    full_name as display_name,
    status,
    created_at,
    rejection_reason,
    more_info_message
  from public.doctors
  where status = 'pending';
