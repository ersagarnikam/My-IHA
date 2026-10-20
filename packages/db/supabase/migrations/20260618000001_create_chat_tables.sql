-- Patient <-> admin chat: one thread per patient, admin-gated sending

-- ─────────────────────────────────────────────────────────
-- chat_threads
-- ─────────────────────────────────────────────────────────
create table public.chat_threads (
  id         uuid        primary key default gen_random_uuid(),
  patient_id uuid        not null references public.patients (id) on delete cascade,
  status     text        not null default 'closed',
  opened_at  timestamptz,
  closed_at  timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint chat_threads_patient_id_key unique (patient_id),
  constraint chat_threads_status_check check (status in ('open', 'closed'))
);

create trigger chat_threads_set_updated_at
  before update on public.chat_threads
  for each row execute function public.set_updated_at();

alter table public.chat_threads enable row level security;

create policy "Patients can view own chat thread"
  on public.chat_threads for select
  to authenticated
  using (patient_id = (select id from public.patients where user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────
-- chat_messages
-- ─────────────────────────────────────────────────────────
create table public.chat_messages (
  id          uuid        primary key default gen_random_uuid(),
  thread_id   uuid        not null references public.chat_threads (id) on delete cascade,
  sender_type text        not null,
  sender_id   uuid        not null references auth.users (id) on delete cascade,
  body        text        not null,
  read        boolean     not null default false,
  created_at  timestamptz not null default now(),
  constraint chat_messages_sender_type_check check (sender_type in ('patient', 'admin'))
);

create index on public.chat_messages (thread_id, created_at);

alter table public.chat_messages enable row level security;

create policy "Patients can view own thread messages"
  on public.chat_messages for select
  to authenticated
  using (
    thread_id in (
      select id from public.chat_threads
      where patient_id = (select id from public.patients where user_id = auth.uid())
    )
  );

create policy "Patients can send messages in own open thread"
  on public.chat_messages for insert
  to authenticated
  with check (
    sender_type = 'patient'
    and sender_id = auth.uid()
    and thread_id in (
      select id from public.chat_threads
      where patient_id = (select id from public.patients where user_id = auth.uid())
        and status = 'open'
    )
  );

create policy "Patients can mark own thread messages read"
  on public.chat_messages for update
  to authenticated
  using (
    thread_id in (
      select id from public.chat_threads
      where patient_id = (select id from public.patients where user_id = auth.uid())
    )
  );

-- ─────────────────────────────────────────────────────────
-- Auto-create a (closed) thread whenever a patient row is created
-- ─────────────────────────────────────────────────────────
create or replace function public.handle_new_patient_chat_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.chat_threads (patient_id) values (new.id)
  on conflict (patient_id) do nothing;
  return new;
end;
$$;

create trigger patients_create_chat_thread
  after insert on public.patients
  for each row execute function public.handle_new_patient_chat_thread();

-- Backfill threads for patients that already existed
insert into public.chat_threads (patient_id)
select id from public.patients
where not exists (
  select 1 from public.chat_threads where chat_threads.patient_id = patients.id
);
