-- Doctor-side consultation scheduling (module 06). Doctors currently have no
-- RLS visibility into consultation_requests/consultation_slots at all, and
-- there is no RPC for a doctor to propose slots, reschedule, or cancel.
-- Mirrors the ownership-check-then-mutate shape of respond_to_case_assignment
-- (20260717131619_add_respond_to_case_assignment_rpc.sql).

-- ─────────────────────────────────────────────────────────
-- RLS: doctors can view requests/slots for their own treatment options
--
-- treatment_options no longer carries doctor_id/procedure_name directly —
-- 20260722000000_create_treatment_plans_tables.sql moved clinical/identity
-- data onto treatment_plans (treatment_options is now just a thin pricing/
-- publish-state row referencing treatment_plan_id).
--
-- These checks are wrapped in `security definer` functions rather than
-- inlined into each USING clause, same fix and same reason as
-- 20260720140000_fix_doctor_patient_policy_recursion.sql: treatment_options
-- is embedded (treatment_options -> treatment_plans -> treatment_plan_specialists)
-- in existing patient-facing queries, and treatment_plan_specialists' own
-- patient policy (20260724140000) queries back into treatment_options. A
-- plain inlined USING clause on treatment_options that itself queries
-- treatment_plans re-enters that same embed chain and Postgres reports
-- "infinite recursion detected in policy for relation treatment_options"
-- (42P17) — not just for doctors, for every query that touches
-- treatment_options, patients included. A security definer function runs as
-- its owner and bypasses RLS on the tables it queries internally, so the
-- lookup never re-triggers treatment_options/treatment_plans row security
-- and the cycle is broken.
-- ─────────────────────────────────────────────────────────
create or replace function public.doctor_owns_treatment_option(target_treatment_option_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.treatment_options t
    join public.treatment_plans tp on tp.id = t.treatment_plan_id
    join public.doctors d on d.id = tp.doctor_id
    where t.id = target_treatment_option_id
      and d.user_id = auth.uid()
  );
$$;

create or replace function public.doctor_owns_consultation_request(target_request_id uuid)
returns boolean
language sql
security definer
set search_path = public
stable
as $$
  select exists (
    select 1
    from public.consultation_requests cr
    where cr.id = target_request_id
      and public.doctor_owns_treatment_option(cr.treatment_option_id)
  );
$$;

drop policy if exists "Doctors can view consultation requests for their treatment options" on public.consultation_requests;

create policy "Doctors can view consultation requests for their treatment options"
  on public.consultation_requests for select
  to authenticated
  using (public.doctor_owns_treatment_option(treatment_option_id));

drop policy if exists "Doctors can view consultation slots for their treatment options" on public.consultation_slots;

create policy "Doctors can view consultation slots for their treatment options"
  on public.consultation_slots for select
  to authenticated
  using (public.doctor_owns_consultation_request(consultation_request_id));

-- treatment_options has row-level security enabled (20260603000003) but,
-- unlike treatment_plans, only ever got a patient-facing read policy
-- ("Patients can read own published treatment options") — doctors have
-- never had SELECT on it. That's normally invisible because app code reads
-- treatment_options through treatment_plans (packages/db/src/treatments.ts),
-- but the two RLS policies above both check ownership *through*
-- treatment_options, so without this policy doctors can't resolve their own
-- treatment_options rows at all and consultation requests never appear,
-- even though the policies themselves are otherwise correct.
drop policy if exists "Doctors can view own treatment options" on public.treatment_options;

create policy "Doctors can view own treatment options"
  on public.treatment_options for select
  to authenticated
  using (public.doctor_owns_treatment_option(treatment_options.id));

-- ─────────────────────────────────────────────────────────
-- consultation_requests.cancellation_reason
-- Mirrors doctor_case_assignments.decline_reason — preserved for history
-- since consultation_requests rows are never deleted.
-- ─────────────────────────────────────────────────────────
alter table public.consultation_requests
  add column if not exists cancellation_reason text;

-- ─────────────────────────────────────────────────────────
-- RPC: propose_consultation_slots
-- Doctor proposes 1-3 candidate times for a request they own. p_slots is a
-- JSON array of {slot_time, slot_end_time} — plain jsonb (not jsonb[] as the
-- module doc sketches) since that's far simpler to send from supabase-js.
-- Callable from 'requested' or 'slots_proposed' (re-proposing before the
-- patient picks replaces the old candidate slots).
-- ─────────────────────────────────────────────────────────
create or replace function public.propose_consultation_slots(p_request_id uuid, p_slots jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doctor_id uuid;
  v_status    text;
  v_owns      boolean;
  v_count     int;
begin
  select id into v_doctor_id from public.doctors where user_id = auth.uid();
  if v_doctor_id is null then
    raise exception 'unauthorized';
  end if;

  select cr.status, (tp.doctor_id = v_doctor_id)
  into v_status, v_owns
  from public.consultation_requests cr
  join public.treatment_options t on t.id = cr.treatment_option_id
  join public.treatment_plans tp on tp.id = t.treatment_plan_id
  where cr.id = p_request_id;

  if v_status is null then
    raise exception 'consultation_request_not_found';
  end if;

  if not coalesce(v_owns, false) then
    raise exception 'unauthorized';
  end if;

  if v_status not in ('requested', 'slots_proposed') then
    raise exception 'invalid_transition';
  end if;

  select jsonb_array_length(p_slots) into v_count;
  if v_count is null or v_count < 1 or v_count > 3 then
    raise exception 'invalid_slot_count';
  end if;

  delete from public.consultation_slots where consultation_request_id = p_request_id;

  insert into public.consultation_slots (consultation_request_id, slot_time, slot_end_time)
  select p_request_id, (elem->>'slot_time')::timestamptz, (elem->>'slot_end_time')::timestamptz
  from jsonb_array_elements(p_slots) as elem;

  update public.consultation_requests
  set status = 'slots_proposed', updated_at = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.propose_consultation_slots(uuid, jsonb) from public;
grant execute on function public.propose_consultation_slots(uuid, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────
-- RPC: reschedule_consultation
-- Only valid once a meeting is already 'scheduled'. Reverts to
-- 'slots_proposed' with new candidate slots, clearing the old selection and
-- Zoom link (a new link is generated once the patient re-selects and pays,
-- same as the initial flow).
-- ─────────────────────────────────────────────────────────
create or replace function public.reschedule_consultation(p_request_id uuid, p_slots jsonb)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doctor_id uuid;
  v_status    text;
  v_owns      boolean;
  v_count     int;
begin
  select id into v_doctor_id from public.doctors where user_id = auth.uid();
  if v_doctor_id is null then
    raise exception 'unauthorized';
  end if;

  select cr.status, (tp.doctor_id = v_doctor_id)
  into v_status, v_owns
  from public.consultation_requests cr
  join public.treatment_options t on t.id = cr.treatment_option_id
  join public.treatment_plans tp on tp.id = t.treatment_plan_id
  where cr.id = p_request_id;

  if v_status is null then
    raise exception 'consultation_request_not_found';
  end if;

  if not coalesce(v_owns, false) then
    raise exception 'unauthorized';
  end if;

  if v_status != 'scheduled' then
    raise exception 'invalid_transition';
  end if;

  select jsonb_array_length(p_slots) into v_count;
  if v_count is null or v_count < 1 or v_count > 3 then
    raise exception 'invalid_slot_count';
  end if;

  delete from public.consultation_slots where consultation_request_id = p_request_id;

  insert into public.consultation_slots (consultation_request_id, slot_time, slot_end_time)
  select p_request_id, (elem->>'slot_time')::timestamptz, (elem->>'slot_end_time')::timestamptz
  from jsonb_array_elements(p_slots) as elem;

  update public.consultation_requests
  set status = 'slots_proposed', zoom_link = null, selected_slot_id = null, updated_at = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.reschedule_consultation(uuid, jsonb) from public;
grant execute on function public.reschedule_consultation(uuid, jsonb) to authenticated;

-- ─────────────────────────────────────────────────────────
-- RPC: cancel_consultation
-- Valid from any non-cancelled status. Requires a reason (surfaced to the
-- patient since a cancelled/moved consultation is time-sensitive).
-- ─────────────────────────────────────────────────────────
create or replace function public.cancel_consultation(p_request_id uuid, p_reason text)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doctor_id uuid;
  v_status    text;
  v_owns      boolean;
begin
  select id into v_doctor_id from public.doctors where user_id = auth.uid();
  if v_doctor_id is null then
    raise exception 'unauthorized';
  end if;

  select cr.status, (tp.doctor_id = v_doctor_id)
  into v_status, v_owns
  from public.consultation_requests cr
  join public.treatment_options t on t.id = cr.treatment_option_id
  join public.treatment_plans tp on tp.id = t.treatment_plan_id
  where cr.id = p_request_id;

  if v_status is null then
    raise exception 'consultation_request_not_found';
  end if;

  if not coalesce(v_owns, false) then
    raise exception 'unauthorized';
  end if;

  if v_status = 'cancelled' then
    raise exception 'already_cancelled';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason_required';
  end if;

  update public.consultation_requests
  set status = 'cancelled', cancellation_reason = p_reason, updated_at = now()
  where id = p_request_id;
end;
$$;

revoke all on function public.cancel_consultation(uuid, text) from public;
grant execute on function public.cancel_consultation(uuid, text) to authenticated;

-- ─────────────────────────────────────────────────────────
-- Surface cancellation_reason in the patient-facing in-portal notification.
-- No new trigger needed for propose/reschedule/cancel — all three go through
-- a `status` update, which the existing `after update of status` trigger
-- already watches.
--
-- This also fixes a pre-existing bug: the original version of this function
-- (20260624000004_notify_consultation_status_change.sql) read
-- treatment_options.procedure_name/treatment_summary directly, both of
-- which 20260722000000_create_treatment_plans_tables.sql already dropped
-- (moved onto treatment_plans, joined via treatment_plan_id) — that lookup
-- has been silently returning null ever since. treatment_summary itself was
-- never a real column; packages/db/src/treatments.ts synthesizes it client-
-- side as `description ?? procedure_name`, which is mirrored here.
-- ─────────────────────────────────────────────────────────
create or replace function public.notify_consultation_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid;
  v_procedure text;
  v_title     text;
  v_message   text;
begin
  if NEW.status is distinct from OLD.status then
    select user_id into v_user_id from public.patients where id = NEW.patient_id;
    if v_user_id is null then
      return NEW;
    end if;

    select coalesce(tp.description, tp.procedure_name) into v_procedure
    from public.treatment_options t
    join public.treatment_plans tp on tp.id = t.treatment_plan_id
    where t.id = NEW.treatment_option_id;

    case NEW.status
      when 'slots_proposed' then
        v_title := 'Consultation slots proposed';
        v_message := 'Your doctor has proposed consultation times for ' || coalesce(v_procedure, 'your treatment plan') || '. Please select a slot.';
      when 'slot_selected' then
        v_title := 'Consultation slot selected';
        v_message := 'You selected a consultation slot for ' || coalesce(v_procedure, 'your treatment plan') || '. Awaiting confirmation.';
      when 'scheduled' then
        v_title := 'Consultation scheduled';
        v_message := 'Your consultation for ' || coalesce(v_procedure, 'your treatment plan') || ' has been scheduled.';
      when 'cancelled' then
        v_title := 'Consultation cancelled';
        v_message := 'Your consultation request for ' || coalesce(v_procedure, 'your treatment plan') || ' has been cancelled.' ||
          case when NEW.cancellation_reason is not null then ' Reason: ' || NEW.cancellation_reason else '' end;
      else
        v_title := 'Consultation status updated';
        v_message := 'Your consultation request status has been updated to ' || NEW.status || '.';
    end case;

    insert into public.notifications (user_id, type, title, message, case_id)
    values (v_user_id, 'consultation_status_updated', v_title, v_message, NEW.case_id);
  end if;

  return NEW;
end;
$$;

-- ─────────────────────────────────────────────────────────
-- New trigger: notify the doctor when a patient submits a consultation
-- request, so they don't have to poll /consultations. Mirrors
-- notify_consultation_status_change()'s shape but fires on insert and
-- resolves the doctor via treatment_options -> treatment_plans -> doctors.
-- ─────────────────────────────────────────────────────────
create or replace function public.notify_doctor_on_consultation_request()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doctor_user_id uuid;
  v_procedure      text;
  v_patient_name   text;
begin
  select d.user_id, coalesce(tp.description, tp.procedure_name)
  into v_doctor_user_id, v_procedure
  from public.treatment_options t
  join public.treatment_plans tp on tp.id = t.treatment_plan_id
  join public.doctors d on d.id = tp.doctor_id
  where t.id = NEW.treatment_option_id;

  if v_doctor_user_id is null then
    return NEW;
  end if;

  -- patients.full_name is a decrypted computed column (public.full_name(p
  -- patients), see 20260717000001_encrypt_patient_demographics.sql) — only
  -- resolvable via a table-qualified/aliased reference, not a bare column
  -- name, since the raw storage column is full_name_enc.
  select p.full_name into v_patient_name from public.patients p where p.id = NEW.patient_id;

  insert into public.notifications (user_id, type, title, message, case_id)
  values (
    v_doctor_user_id,
    'consultation_request_received',
    'New consultation request',
    coalesce(v_patient_name, 'A patient') || ' requested an online consultation for ' ||
      coalesce(v_procedure, 'a treatment option') || '.',
    NEW.case_id
  );

  return NEW;
end;
$$;

drop trigger if exists consultation_requests_notify_doctor on public.consultation_requests;

create trigger consultation_requests_notify_doctor
  after insert on public.consultation_requests
  for each row
  execute function public.notify_doctor_on_consultation_request();
