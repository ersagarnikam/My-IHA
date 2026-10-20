-- ─────────────────────────────────────────────────────────
-- Doctor registration/annual fee tracking columns.
--
-- Kept separate from `doctors.status` deliberately — `status` stays purely
-- "has IHA approved this doctor's credentials," fee state is a distinct
-- concern gated after approval (see create_doctor_fee_payment RPC).
--
-- registration_fee_paid_at: null until the one-time registration fee is
--   paid; this is the dashboard-access gate in apps/doctor.
-- annual_fee_next_due_at: set to registration_fee_paid_at + 1 year when the
--   registration fee is paid, then advanced by 1 year each time an annual
--   payment completes. The registration year itself never has an annual
--   charge (the fee cycle only starts at the 1-year anniversary), which is
--   what satisfies "no annual fee in the first year" — no extra waived
--   cycle is needed on top of that.
-- annual_fee_reminder_sent_for: dedupe marker for the annual-fee-due
--   reminder cron — set to the due date a reminder was sent for, so the
--   doctor gets exactly one notification per billing cycle rather than one
--   every day within the reminder window.
-- ─────────────────────────────────────────────────────────
alter table public.doctors
  add column registration_fee_paid_at timestamptz,
  add column annual_fee_next_due_at date,
  add column annual_fee_reminder_sent_for date;
