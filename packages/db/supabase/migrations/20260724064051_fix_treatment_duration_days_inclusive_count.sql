-- treatment_duration_days was generated as a plain exclusive date diff
-- (end - start), disagreeing with the inclusive day count the hospital
-- portal's Duration hint shows (end - start + 1, e.g. 1 night = 2 days).
-- Generated column expressions can't be altered in place, so drop + re-add.
alter table public.treatment_plans
  drop column treatment_duration_days;

alter table public.treatment_plans
  add column treatment_duration_days int4 generated always as (
    treatment_end_date - treatment_start_date + 1
  ) stored;
