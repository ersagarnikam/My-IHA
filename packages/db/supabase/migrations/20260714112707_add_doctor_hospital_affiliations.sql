-- ─────────────────────────────────────────────────────────
-- doctor_hospital_affiliations
-- Replaces doctors.hospital_id (single, not-null FK) — the SOW requires a
-- doctor to affiliate with multiple hospitals, and affiliations can be empty
-- at registration time. Backfill existing seed rows, then drop the old
-- column; grepped the app code first — nothing reads doctors.hospital_id
-- directly (only the unrelated treatment_options.hospital_id column).
-- ─────────────────────────────────────────────────────────
create table public.doctor_hospital_affiliations (
  id          uuid        primary key default gen_random_uuid(),
  doctor_id   uuid        not null references public.doctors (id) on delete cascade,
  hospital_id uuid        not null references public.hospitals (id) on delete cascade,
  created_at  timestamptz not null default now(),
  unique (doctor_id, hospital_id)
);

create index on public.doctor_hospital_affiliations (doctor_id);
create index on public.doctor_hospital_affiliations (hospital_id);

alter table public.doctor_hospital_affiliations enable row level security;

create policy "Authenticated users can read doctor hospital affiliations"
  on public.doctor_hospital_affiliations for select
  to authenticated
  using (true);

create policy "Doctors can add own hospital affiliations"
  on public.doctor_hospital_affiliations for insert
  to authenticated
  with check (
    doctor_id in (select id from public.doctors where user_id = auth.uid())
  );

create policy "Doctors can remove own hospital affiliations"
  on public.doctor_hospital_affiliations for delete
  to authenticated
  using (
    doctor_id in (select id from public.doctors where user_id = auth.uid())
  );

insert into public.doctor_hospital_affiliations (doctor_id, hospital_id)
select id, hospital_id from public.doctors
where hospital_id is not null
on conflict (doctor_id, hospital_id) do nothing;

alter table public.doctors drop column hospital_id;
