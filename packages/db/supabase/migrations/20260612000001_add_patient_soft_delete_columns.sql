-- Soft-delete columns for patients: account deletion now marks the row
-- instead of removing it immediately, with a 30-day grace period before
-- permanent deletion.

alter table public.patients
  add column is_deleted boolean not null default false,
  add column deleted_at timestamptz,
  add column scheduled_delete_at timestamptz;

-- Speeds up the daily sweep for accounts past their retention window
create index patients_scheduled_delete_at_idx
  on public.patients (scheduled_delete_at)
  where is_deleted = true;
