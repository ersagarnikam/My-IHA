-- Let doctors/hospitals ask MTA Admin to reopen a closed provider message
-- thread, stating a reason. Mirrors 20260629000006_add_chat_thread_reopen_request.sql
-- for the patient side. Admin-side review UI is a follow-up; this just
-- captures the request so it's visible on the thread row.
alter table public.provider_message_threads
  add column reopen_requested_at timestamptz,
  add column reopen_reason text;

create policy "Providers can request reopen of own closed thread"
  on public.provider_message_threads for update
  to authenticated
  using (
    status = 'closed'
    and (
      (account_type = 'doctor' and doctor_id in (select id from public.doctors where user_id = auth.uid()))
      or (account_type = 'hospital' and hospital_id in (select id from public.hospitals where user_id = auth.uid()))
    )
  )
  with check (
    status = 'closed'
    and (
      (account_type = 'doctor' and doctor_id in (select id from public.doctors where user_id = auth.uid()))
      or (account_type = 'hospital' and hospital_id in (select id from public.hospitals where user_id = auth.uid()))
    )
  );
