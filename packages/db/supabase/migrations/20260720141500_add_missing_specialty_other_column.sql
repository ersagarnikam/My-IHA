-- `specialty_other` is defined in the original 20260602000001_create_cases_tables.sql
-- and used throughout the app (case submission's insert_case RPC, case
-- detail/list pages), but is missing from the live `cases` table — schema
-- drift between this repo's migrations and what was actually applied to
-- production. Re-adding it here so app queries selecting it stop erroring
-- with "column cases.specialty_other does not exist".

alter table public.cases add column if not exists specialty_other text;
