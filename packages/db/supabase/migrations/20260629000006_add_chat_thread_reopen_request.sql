-- Let patients ask their MTA coordinator to reopen a closed chat thread,
-- stating a reason. Admin-side review UI is a follow-up; this just captures
-- the request so it's visible on the thread row.
alter table public.chat_threads
  add column reopen_requested_at timestamptz,
  add column reopen_reason text;

create policy "Patients can request reopen of own closed thread"
  on public.chat_threads for update
  to authenticated
  using (
    patient_id = (select id from public.patients where user_id = auth.uid())
    and status = 'closed'
  )
  with check (
    patient_id = (select id from public.patients where user_id = auth.uid())
    and status = 'closed'
  );
