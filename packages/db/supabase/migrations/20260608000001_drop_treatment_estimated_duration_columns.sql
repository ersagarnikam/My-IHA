-- Remove redundant treatment_options columns superseded by treatment_duration/recovery_time
alter table public.treatment_options
  drop column if exists estimated_duration_days,
  drop column if exists estimated_timeline;
