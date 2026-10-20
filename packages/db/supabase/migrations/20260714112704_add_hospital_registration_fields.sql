-- ─────────────────────────────────────────────────────────
-- hospitals: registration/account fields (Module 01)
-- `hospitals` was previously a read-only catalog table seeded via migration.
-- This adds self-registration support: an owning auth.users row, an approval
-- status, and the registration/contact/accreditation fields collected by the
-- Hospital Portal's registration wizard.
-- ─────────────────────────────────────────────────────────
alter table public.hospitals
  add column if not exists user_id                   uuid unique references auth.users (id),
  add column if not exists status                     text not null default 'pending',
  add column if not exists registration_type          text,
  add column if not exists registration_number        text,
  add column if not exists abn_number                 text,
  add column if not exists address                    text,
  add column if not exists zip_code                   text,
  add column if not exists phone                       text,
  add column if not exists contact_email              text,
  add column if not exists license_number             text,
  add column if not exists accreditation_body         text,
  add column if not exists certificates               jsonb not null default '[]'::jsonb,
  add column if not exists administrator_name         text,
  add column if not exists administrator_designation  text,
  add column if not exists rejection_reason           text,
  add column if not exists more_info_message          text;

alter table public.hospitals
  add constraint hospitals_status_check
  check (status in ('pending', 'approved', 'rejected', 'more_info_requested'));

-- Self-service reads/updates for the owning hospital account. No insert
-- policy — rows are only created via the register_hospital() RPC so status
-- can't be spoofed to anything but 'pending'.
create policy "Hospitals can read own account row"
  on public.hospitals for select
  to authenticated
  using (user_id = auth.uid());

create policy "Hospitals can update own account row"
  on public.hospitals for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
