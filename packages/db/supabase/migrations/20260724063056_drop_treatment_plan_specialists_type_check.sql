-- Specialist role is now a free-text field the doctor types in, rather than
-- a fixed dropdown of roles, so the old fixed-list check no longer applies.
alter table public.treatment_plan_specialists
  drop constraint treatment_plan_specialists_type_check;
