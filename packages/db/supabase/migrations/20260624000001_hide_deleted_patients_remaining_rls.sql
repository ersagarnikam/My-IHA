-- Extend the soft-delete visibility fix from 20260612000002 to the tables
-- it missed: chat, consultations, notifications and payment methods. Same
-- defense-in-depth rationale - banning blocks new sign-ins but an
-- already-issued access token stays valid until it expires, so RLS needs
-- to deny reads for soft-deleted patients explicitly.

-- chat_threads
drop policy if exists "Patients can view own chat thread" on public.chat_threads;

create policy "Patients can view own chat thread"
  on public.chat_threads for select
  to authenticated
  using (
    patient_id = (
      select id from public.patients where user_id = auth.uid() and not is_deleted
    )
  );

-- chat_messages
drop policy if exists "Patients can view own thread messages" on public.chat_messages;

create policy "Patients can view own thread messages"
  on public.chat_messages for select
  to authenticated
  using (
    thread_id in (
      select id from public.chat_threads
      where patient_id = (
        select id from public.patients where user_id = auth.uid() and not is_deleted
      )
    )
  );

-- consultation_requests
drop policy if exists "Patients can view own consultation requests" on public.consultation_requests;

create policy "Patients can view own consultation requests"
  on public.consultation_requests for select
  to authenticated
  using (
    patient_id = (
      select id from public.patients where user_id = auth.uid() and not is_deleted
    )
  );

-- consultation_slots
drop policy if exists "Patients can view own consultation slots" on public.consultation_slots;

create policy "Patients can view own consultation slots"
  on public.consultation_slots for select
  to authenticated
  using (
    consultation_request_id in (
      select cr.id from public.consultation_requests cr
      join public.patients p on p.id = cr.patient_id
      where p.user_id = auth.uid() and not p.is_deleted
    )
  );

-- notifications
drop policy if exists "Users can view own notifications" on public.notifications;

create policy "Users can view own notifications"
  on public.notifications for select
  to authenticated
  using (
    user_id = auth.uid()
    and not exists (
      select 1 from public.patients where user_id = auth.uid() and is_deleted
    )
  );

-- payment_methods
drop policy if exists "Users can view own payment methods" on public.payment_methods;

create policy "Users can view own payment methods"
  on public.payment_methods for select
  to authenticated
  using (
    auth.uid() = user_id
    and not exists (
      select 1 from public.patients where user_id = auth.uid() and is_deleted
    )
  );
