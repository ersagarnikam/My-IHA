-- ─────────────────────────────────────────────────────────
-- consultation_slots.slot_end_time
-- Slots are proposed as time ranges (e.g. 2:00pm - 3:00pm), not just a
-- start time. Backfill existing rows with a 1 hour duration.
-- ─────────────────────────────────────────────────────────
alter table public.consultation_slots
  add column slot_end_time timestamptz;

update public.consultation_slots
set slot_end_time = slot_time + interval '1 hour'
where slot_end_time is null;

alter table public.consultation_slots
  alter column slot_end_time set not null;

alter table public.consultation_slots
  add constraint consultation_slots_end_after_start check (slot_end_time > slot_time);
