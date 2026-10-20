-- ─────────────────────────────────────────────────────────
-- Consultation fee payments
-- Once a patient selects a proposed consultation slot, a $200 AUD
-- consultation fee must be paid before the slot is confirmed and a
-- Zoom meeting is generated.
-- ─────────────────────────────────────────────────────────
alter table public.payments
  add column consultation_request_id uuid references public.consultation_requests (id) on delete set null;

create index on public.payments (consultation_request_id);
