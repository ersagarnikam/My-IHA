create table public.payments (
  id                       uuid primary key default gen_random_uuid(),
  case_id                  uuid not null references public.cases(id) on delete cascade,
  treatment_option_id      uuid references public.treatment_options(id),
  patient_id               uuid not null references public.patients(id) on delete cascade,
  amount_aud               numeric(10,2) not null,
  payment_type             text not null default 'full_payment',
  status                   text not null default 'pending',
  gateway                  text not null default 'stripe',
  gateway_reference        text,
  stripe_payment_intent_id text unique,
  invoice_path             text,
  paid_at                  timestamptz,
  created_at               timestamptz not null default now()
);

create index payments_case_id_idx    on public.payments(case_id);
create index payments_patient_id_idx on public.payments(patient_id);

alter table public.payments enable row level security;

create policy "Patients can view own payments"
  on public.payments for select
  to authenticated
  using (
    auth.uid() = (select user_id from public.patients where id = patient_id)
  );

create policy "Patients can insert own payments"
  on public.payments for insert
  to authenticated
  with check (
    auth.uid() = (select user_id from public.patients where id = patient_id)
  );
