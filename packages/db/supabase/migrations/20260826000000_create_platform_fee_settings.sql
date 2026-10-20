-- ─────────────────────────────────────────────────────────
-- platform_fee_settings
--
-- Admin-editable platform fee amounts. No admin UI exists yet to write these,
-- so for now IHA staff edit `amount_aud` directly in the Supabase Table
-- Editor — same non-technical-staff-editable pattern as `specialties`. App
-- code always reads the amount from this table rather than hardcoding it, so
-- a dashboard edit takes effect on the next payment with no deploy needed.
-- ─────────────────────────────────────────────────────────
create table public.platform_fee_settings (
  id         uuid        primary key default gen_random_uuid(),
  fee_key    text        not null unique,
  amount_aud numeric(10,2) not null,
  updated_at timestamptz not null default now()
);

create trigger platform_fee_settings_set_updated_at
  before update on public.platform_fee_settings
  for each row execute function public.set_updated_at();

alter table public.platform_fee_settings enable row level security;

-- Read-only from the app; writes happen via the Supabase dashboard (service
-- role bypasses RLS) until an admin RPC exists.
create policy "Authenticated users can view fee settings"
  on public.platform_fee_settings for select
  to authenticated
  using (true);

insert into public.platform_fee_settings (fee_key, amount_aud) values
  ('doctor_registration_fee', 5000.00),
  ('doctor_annual_fee', 2000.00);
