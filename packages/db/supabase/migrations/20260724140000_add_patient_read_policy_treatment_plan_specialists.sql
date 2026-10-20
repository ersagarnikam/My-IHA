-- treatment_plan_specialists only had a doctor-facing select policy
-- (20260722000000_create_treatment_plans_tables.sql), same gap as
-- treatment_plans before its patient policy was added. Since the join in
-- packages/db/src/treatments.ts isn't `!inner` here, RLS silently drops
-- blocked specialist rows instead of erroring — which meant patients saw
-- neither the "Care Team" section nor that specialist's cost in their total.
create policy "Patients can view specialists for published treatment options"
  on public.treatment_plan_specialists for select
  to authenticated
  using (
    exists (
      select 1
      from public.treatment_options o
      join public.cases c on c.id = o.case_id
      join public.patients p on p.id = c.patient_id
      where o.treatment_plan_id = treatment_plan_specialists.treatment_plan_id
        and o.published_at is not null
        and p.user_id = auth.uid()
        and not p.is_deleted
    )
  );
