-- The hospital case-detail page now shows the doctor's submitted treatment
-- plan (diagnosis, procedure, cost breakdown, specialists, etc.), not just
-- its status. 20260730070000 only exposed status via a security-definer RPC
-- (treatment_plans' own RLS was doctor-only, 20260722000000:87-90); this
-- adds real SELECT policies on treatment_plans/treatment_plan_specialists
-- for hospitals, gated the same way hospital case/patient access already is
-- (20260730060000): the plan must name this hospital and be past `draft`.
--
-- Direct policies here (not security-definer) are fine, unlike
-- hospital_has_access_to_case/_assignment — those wrap checks run from
-- *another* table's RLS-restricted perspective (where an inline subquery
-- into treatment_plans would see zero rows); this policy lives on
-- treatment_plans itself, so a plain USING clause works.
--
-- The encrypted clinical/cost columns are exposed as computed functions
-- (diagnosis(), cost_breakdown(), etc., 20260724150000) already
-- `grant execute ... to authenticated` — once a hospital's query can see
-- the row via this policy, those computed columns resolve the same way
-- they already do for the owning doctor.

create policy "Hospitals can view treatment plans for their hospital"
  on public.treatment_plans for select
  to authenticated
  using (
    status != 'draft'
    and exists (
      select 1 from public.hospitals h
      where h.id = treatment_plans.hospital_id
        and h.user_id = auth.uid()
    )
  );

create policy "Hospitals can view specialists for their hospital's treatment plans"
  on public.treatment_plan_specialists for select
  to authenticated
  using (
    exists (
      select 1
      from public.treatment_plans tp
      join public.hospitals h on h.id = tp.hospital_id
      where tp.id = treatment_plan_specialists.treatment_plan_id
        and tp.status != 'draft'
        and h.user_id = auth.uid()
    )
  );
