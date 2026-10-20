-- ─────────────────────────────────────────────────────────
-- doctor_fee_payments
--
-- Doctor-scoped payment records for the registration fee and annual renewal
-- fee. Kept separate from `payments` (patient/case-scoped, `case_id`/
-- `patient_id` both `not null`) rather than overloading that table.
--
-- Unlike `payments` — where the client inserts its own pending row directly
-- with an app-computed amount — there is deliberately no client insert
-- policy here at all. A doctor fee amount must never be client-suppliable;
-- rows are only created by the create_doctor_fee_payment RPC (which reads
-- the amount from platform_fee_settings server-side) and only updated by the
-- Stripe webhook (service role) plus the set_doctor_fee_payment_stripe_intent
-- RPC below.
-- ─────────────────────────────────────────────────────────
create table public.doctor_fee_payments (
  id                       uuid primary key default gen_random_uuid(),
  doctor_id                uuid not null references public.doctors(id) on delete cascade,
  fee_type                 text not null check (fee_type in ('registration', 'annual')),
  -- annual only: the due date (doctors.annual_fee_next_due_at at charge time)
  -- this payment covers; null for a registration payment.
  billing_period           date,
  amount_aud               numeric(10,2) not null,
  status                   text not null default 'pending' check (status in ('pending', 'completed', 'failed')),
  gateway                  text not null default 'stripe',
  gateway_reference        text,
  stripe_payment_intent_id text unique,
  invoice_path             text,
  paid_at                  timestamptz,
  created_at               timestamptz not null default now()
);

create index doctor_fee_payments_doctor_id_idx on public.doctor_fee_payments(doctor_id);

-- At most one live (pending/completed) registration payment per doctor.
create unique index doctor_fee_payments_one_registration
  on public.doctor_fee_payments (doctor_id)
  where fee_type = 'registration' and status <> 'failed';

-- At most one live payment per doctor per annual billing cycle.
create unique index doctor_fee_payments_one_per_period
  on public.doctor_fee_payments (doctor_id, billing_period)
  where fee_type = 'annual' and status <> 'failed';

alter table public.doctor_fee_payments enable row level security;

create policy "Doctors can view own fee payments"
  on public.doctor_fee_payments for select
  to authenticated
  using (
    auth.uid() = (select user_id from public.doctors where id = doctor_id)
  );

-- No insert/update policy for authenticated users — see header comment.
