-- Extend provider (doctor/hospital) <-> MTA Admin messaging
-- (20260717131620_create_provider_messaging_tables.sql) to also cover
-- visa lawyers, per docs/modules/visa-lawyer-portal/08-messaging.md:
-- lawyer <-> MTA Admin only, same one-thread-per-account/admin-gated-opening
-- shape as doctor/hospital, reusing provider_message_threads/provider_messages
-- rather than forking a new table pair.
--
-- account_type uses 'lawyer' (not 'visa_lawyer') to stay symmetric with
-- doctor/hospital, where account_type and sender_type share the same value
-- ('doctor'/'hospital'). The "Providers can send messages in own open
-- thread" policy below relies on `t.account_type = provider_messages.sender_type`
-- holding literally — a 'visa_lawyer' vs 'lawyer' mismatch would silently
-- break inserts for lawyers.

alter table public.provider_message_threads
  add column lawyer_id uuid references public.lawyers (id) on delete cascade;

alter table public.provider_message_threads
  drop constraint provider_message_threads_account_type_check;
alter table public.provider_message_threads
  add constraint provider_message_threads_account_type_check
  check (account_type in ('hospital', 'doctor', 'lawyer'));

alter table public.provider_message_threads
  drop constraint provider_message_threads_account_shape_check;
alter table public.provider_message_threads
  add constraint provider_message_threads_account_shape_check check (
    (account_type = 'hospital' and hospital_id is not null and doctor_id is null and lawyer_id is null) or
    (account_type = 'doctor' and doctor_id is not null and hospital_id is null and lawyer_id is null) or
    (account_type = 'lawyer' and lawyer_id is not null and hospital_id is null and doctor_id is null)
  );

create unique index provider_message_threads_lawyer_id_key
  on public.provider_message_threads (lawyer_id) where lawyer_id is not null;

alter table public.provider_messages
  drop constraint provider_messages_sender_type_check;
alter table public.provider_messages
  add constraint provider_messages_sender_type_check
  check (sender_type in ('hospital', 'doctor', 'lawyer', 'admin'));

-- ─────────────────────────────────────────────────────────
-- RLS: add the lawyer branch to every existing provider-messaging policy
-- ─────────────────────────────────────────────────────────
drop policy if exists "Providers can view own thread" on public.provider_message_threads;
create policy "Providers can view own thread"
  on public.provider_message_threads for select
  to authenticated
  using (
    (account_type = 'doctor' and doctor_id in (select id from public.doctors where user_id = auth.uid()))
    or (account_type = 'hospital' and hospital_id in (select id from public.hospitals where user_id = auth.uid()))
    or (account_type = 'lawyer' and lawyer_id in (select id from public.lawyers where user_id = auth.uid()))
  );

drop policy if exists "Providers can view own thread messages" on public.provider_messages;
create policy "Providers can view own thread messages"
  on public.provider_messages for select
  to authenticated
  using (
    thread_id in (
      select id from public.provider_message_threads t
      where (t.account_type = 'doctor' and t.doctor_id in (select id from public.doctors where user_id = auth.uid()))
         or (t.account_type = 'hospital' and t.hospital_id in (select id from public.hospitals where user_id = auth.uid()))
         or (t.account_type = 'lawyer' and t.lawyer_id in (select id from public.lawyers where user_id = auth.uid()))
    )
  );

drop policy if exists "Providers can send messages in own open thread" on public.provider_messages;
create policy "Providers can send messages in own open thread"
  on public.provider_messages for insert
  to authenticated
  with check (
    sender_id = auth.uid()
    and sender_type in ('hospital', 'doctor', 'lawyer')
    and exists (
      select 1 from public.provider_message_threads t
      where t.id = provider_messages.thread_id
        and t.status = 'open'
        and t.account_type = provider_messages.sender_type
        and (
          (t.account_type = 'doctor' and t.doctor_id in (select id from public.doctors where user_id = auth.uid()))
          or (t.account_type = 'hospital' and t.hospital_id in (select id from public.hospitals where user_id = auth.uid()))
          or (t.account_type = 'lawyer' and t.lawyer_id in (select id from public.lawyers where user_id = auth.uid()))
        )
    )
  );

drop policy if exists "Providers can mark own thread admin messages read" on public.provider_messages;
create policy "Providers can mark own thread admin messages read"
  on public.provider_messages for update
  to authenticated
  using (
    sender_type = 'admin'
    and thread_id in (
      select id from public.provider_message_threads t
      where (t.account_type = 'doctor' and t.doctor_id in (select id from public.doctors where user_id = auth.uid()))
         or (t.account_type = 'hospital' and t.hospital_id in (select id from public.hospitals where user_id = auth.uid()))
         or (t.account_type = 'lawyer' and t.lawyer_id in (select id from public.lawyers where user_id = auth.uid()))
    )
  );

drop policy if exists "Providers can request reopen of own closed thread" on public.provider_message_threads;
create policy "Providers can request reopen of own closed thread"
  on public.provider_message_threads for update
  to authenticated
  using (
    status = 'closed'
    and (
      (account_type = 'doctor' and doctor_id in (select id from public.doctors where user_id = auth.uid()))
      or (account_type = 'hospital' and hospital_id in (select id from public.hospitals where user_id = auth.uid()))
      or (account_type = 'lawyer' and lawyer_id in (select id from public.lawyers where user_id = auth.uid()))
    )
  )
  with check (
    status = 'closed'
    and (
      (account_type = 'doctor' and doctor_id in (select id from public.doctors where user_id = auth.uid()))
      or (account_type = 'hospital' and hospital_id in (select id from public.hospitals where user_id = auth.uid()))
      or (account_type = 'lawyer' and lawyer_id in (select id from public.lawyers where user_id = auth.uid()))
    )
  );

-- ─────────────────────────────────────────────────────────
-- Auto-create a (closed) thread whenever a lawyer row is created, same as
-- handle_new_hospital_message_thread/handle_new_doctor_message_thread.
-- ─────────────────────────────────────────────────────────
create or replace function public.handle_new_lawyer_message_thread()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.provider_message_threads (account_type, lawyer_id) values ('lawyer', new.id)
  on conflict (lawyer_id) where lawyer_id is not null do nothing;
  return new;
end;
$$;

create trigger lawyers_create_message_thread
  after insert on public.lawyers
  for each row execute function public.handle_new_lawyer_message_thread();

-- Backfill threads for lawyers that already existed
insert into public.provider_message_threads (account_type, lawyer_id)
select 'lawyer', id from public.lawyers
where not exists (
  select 1 from public.provider_message_threads where provider_message_threads.lawyer_id = lawyers.id
);

-- ─────────────────────────────────────────────────────────
-- Extend the admin-message notification trigger
-- (20260805000000_add_hospital_doctor_notification_triggers.sql) to also
-- resolve lawyers.user_id. Dormant for lawyers the same way it's dormant for
-- doctors/hospitals until an Admin Portal exists to write sender_type = 'admin' rows.
-- ─────────────────────────────────────────────────────────
create or replace function public.notify_provider_on_admin_message()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id uuid;
begin
  if NEW.sender_type != 'admin' then
    return NEW;
  end if;

  select
    case t.account_type
      when 'hospital' then h.user_id
      when 'doctor' then d.user_id
      when 'lawyer' then l.user_id
    end
  into v_user_id
  from public.provider_message_threads t
  left join public.hospitals h on h.id = t.hospital_id
  left join public.doctors d on d.id = t.doctor_id
  left join public.lawyers l on l.id = t.lawyer_id
  where t.id = NEW.thread_id;

  if v_user_id is null then
    return NEW;
  end if;

  insert into public.notifications (user_id, type, title, message)
  values (
    v_user_id,
    'new_message',
    'New message from MTA Admin',
    case when length(NEW.body) > 140 then left(NEW.body, 140) || '...' else NEW.body end
  );

  return NEW;
end;
$$;
