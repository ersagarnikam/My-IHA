-- Provider (doctor/hospital) <-> MTA Admin messaging. Mirrors the patient
-- chat_threads/chat_messages pattern exactly (20260618000001_create_chat_tables.sql):
-- one thread per account, auto-created on account creation, admin-gated opening.
-- See hospital-portal module 09.

create table public.provider_message_threads (
  id           uuid        primary key default gen_random_uuid(),
  account_type text        not null,
  hospital_id  uuid        references public.hospitals (id) on delete cascade,
  doctor_id    uuid        references public.doctors (id) on delete cascade,
  status       text        not null default 'closed',
  opened_at    timestamptz,
  closed_at    timestamptz,
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  constraint provider_message_threads_account_type_check
    check (account_type in ('hospital', 'doctor')),
  constraint provider_message_threads_status_check
    check (status in ('open', 'closed')),
  constraint provider_message_threads_account_shape_check check (
    (account_type = 'hospital' and hospital_id is not null and doctor_id is null) or
    (account_type = 'doctor' and doctor_id is not null and hospital_id is null)
  )
);

create unique index provider_message_threads_hospital_id_key
  on public.provider_message_threads (hospital_id) where hospital_id is not null;
create unique index provider_message_threads_doctor_id_key
  on public.provider_message_threads (doctor_id) where doctor_id is not null;

create trigger provider_message_threads_set_updated_at
  before update on public.provider_message_threads
  for each row execute function public.set_updated_at();

alter table public.provider_message_threads enable row level security;

create policy "Providers can view own thread"
  on public.provider_message_threads for select
  to authenticated
  using (
    (account_type = 'doctor' and doctor_id in (select id from public.doctors where user_id = auth.uid()))
    or (account_type = 'hospital' and hospital_id in (select id from public.hospitals where user_id = auth.uid()))
  );

create table public.provider_messages (
  id          uuid        primary key default gen_random_uuid(),
  thread_id   uuid        not null references public.provider_message_threads (id) on delete cascade,
  sender_type text        not null,
  sender_id   uuid        not null references auth.users (id) on delete cascade,
  body        text        not null,
  read        boolean     not null default false,
  created_at  timestamptz not null default now(),
  constraint provider_messages_sender_type_check check (sender_type in ('hospital', 'doctor', 'admin'))
);

create index on public.provider_messages (thread_id, created_at);

alter table public.provider_messages enable row level security;

create policy "Providers can view own thread messages"
  on public.provider_messages for select
  to authenticated
  using (
    thread_id in (
      select id from public.provider_message_threads t
      where (t.account_type = 'doctor' and t.doctor_id in (select id from public.doctors where user_id = auth.uid()))
         or (t.account_type = 'hospital' and t.hospital_id in (select id from public.hospitals where user_id = auth.uid()))
    )
  );

create policy "Providers can send messages in own open thread"
  on public.provider_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and sender_type in ('hospital', 'doctor')
    and exists (
      select 1 from public.provider_message_threads t
      where t.id = provider_messages.thread_id
        and t.status = 'open'
        and t.account_type = provider_messages.sender_type
        and (
          (t.account_type = 'doctor' and t.doctor_id in (select id from public.doctors where user_id = auth.uid()))
          or (t.account_type = 'hospital' and t.hospital_id in (select id from public.hospitals where user_id = auth.uid()))
        )
    )
  );

create policy "Providers can mark own thread admin messages read"
  on public.provider_messages for update
  to authenticated
  using (
    sender_type = 'admin'
    and thread_id in (
      select id from public.provider_message_threads t
      where (t.account_type = 'doctor' and t.doctor_id in (select id from public.doctors where user_id = auth.uid()))
         or (t.account_type = 'hospital' and t.hospital_id in (select id from public.hospitals where user_id = auth.uid()))
    )
  );

-- ─────────────────────────────────────────────────────────
-- Auto-create a (closed) thread whenever a hospital/doctor row is created
-- ─────────────────────────────────────────────────────────
create or replace function public.handle_new_hospital_message_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.provider_message_threads (account_type, hospital_id) values ('hospital', new.id)
  on conflict (hospital_id) where hospital_id is not null do nothing;
  return new;
end;
$$;

create trigger hospitals_create_message_thread
  after insert on public.hospitals
  for each row execute function public.handle_new_hospital_message_thread();

create or replace function public.handle_new_doctor_message_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.provider_message_threads (account_type, doctor_id) values ('doctor', new.id)
  on conflict (doctor_id) where doctor_id is not null do nothing;
  return new;
end;
$$;

create trigger doctors_create_message_thread
  after insert on public.doctors
  for each row execute function public.handle_new_doctor_message_thread();

-- Backfill threads for hospitals/doctors that already existed
insert into public.provider_message_threads (account_type, hospital_id)
select 'hospital', id from public.hospitals
where not exists (
  select 1 from public.provider_message_threads where provider_message_threads.hospital_id = hospitals.id
);

insert into public.provider_message_threads (account_type, doctor_id)
select 'doctor', id from public.doctors
where not exists (
  select 1 from public.provider_message_threads where provider_message_threads.doctor_id = doctors.id
);
