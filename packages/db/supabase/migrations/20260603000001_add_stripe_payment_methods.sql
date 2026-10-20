-- Add stripe_customer_id to patients and create payment_methods table

alter table public.patients
  add column if not exists stripe_customer_id text unique;

create table public.payment_methods (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  stripe_payment_method_id text not null unique,
  last4 text not null,
  brand text not null,
  exp_month integer not null,
  exp_year integer not null,
  is_default boolean not null default false,
  created_at timestamptz not null default now()
);

create index payment_methods_user_id_idx on public.payment_methods(user_id);

alter table public.payment_methods enable row level security;

create policy "Users can view own payment methods"
  on public.payment_methods for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Users can insert own payment methods"
  on public.payment_methods for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Users can update own payment methods"
  on public.payment_methods for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can delete own payment methods"
  on public.payment_methods for delete
  to authenticated
  using (auth.uid() = user_id);
