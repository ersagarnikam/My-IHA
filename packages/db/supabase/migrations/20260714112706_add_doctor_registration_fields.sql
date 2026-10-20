-- ─────────────────────────────────────────────────────────
-- doctors: registration/account fields (Module 01)
-- Same shape as the hospitals migration. `specialty` (singular) is left
-- untouched — it's used by the Patient Portal's treatment-option display.
-- `specialties` (plural, array) is new and backs the registration wizard's
-- multi-select.
-- ─────────────────────────────────────────────────────────
alter table public.doctors
  add column if not exists user_id         uuid unique references auth.users (id),
  add column if not exists status          text not null default 'pending',
  add column if not exists specialties     text[],
  add column if not exists bio             text,
  add column if not exists languages_spoken text[],
  add column if not exists license_number  text,
  add column if not exists contact_email   text,
  add column if not exists contact_phone   text,
  add column if not exists rejection_reason text,
  add column if not exists more_info_message text;

alter table public.doctors
  add constraint doctors_status_check
  check (status in ('pending', 'approved', 'rejected', 'more_info_requested'));

create policy "Doctors can read own account row"
  on public.doctors for select
  to authenticated
  using (user_id = auth.uid());

create policy "Doctors can update own account row"
  on public.doctors for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());
