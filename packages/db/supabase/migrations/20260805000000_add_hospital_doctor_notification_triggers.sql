-- Module 11 (hospital/doctor notifications) is almost entirely unbuilt per
-- docs/modules/hospital-portal/11-notifications.md: no route, no
-- bell, and no trigger anywhere resolves hospitals.user_id. This migration
-- adds the UI-adjacent DB triggers for the two notification types whose
-- driving event already happens in apps/hospital today (doctor treatment-
-- plan submission and provider messaging), so they aren't gated on the
-- unbuilt MTA Admin portal. Types still gated on Admin/Visa-Lawyer portals
-- (case_received, registration_status_changed, visa_rejected, etc.) are left
-- for a later migration once those portals exist.

-- ─────────────────────────────────────────────────────────
-- Trigger: notify the hospital named on a treatment plan once the doctor
-- submits it to MTA Admin. Mirrors notify_doctor_on_consultation_request's
-- shape (20260724121134_add_doctor_consultation_scheduling.sql) but fires on
-- treatment_plans.status transitioning to 'submitted_to_iha', which is the
-- point submit_treatment_plan() (20260722000000_create_treatment_plans_tables.sql)
-- guarantees hospital_id is set (it's part of the required-fields gate).
-- ─────────────────────────────────────────────────────────
create or replace function public.notify_hospital_on_treatment_plan_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital_user_id uuid;
  v_doctor_name       text;
begin
  if NEW.status = 'submitted_to_iha' and OLD.status is distinct from NEW.status then
    select user_id into v_hospital_user_id from public.hospitals where id = NEW.hospital_id;
    if v_hospital_user_id is null then
      return NEW;
    end if;

    select full_name into v_doctor_name from public.doctors where id = NEW.doctor_id;

    insert into public.notifications (user_id, type, title, message, case_id)
    values (
      v_hospital_user_id,
      'hospital_selected_by_doctor',
      'New treatment plan for your hospital',
      coalesce(v_doctor_name, 'A doctor') || ' submitted a treatment plan naming your hospital for ' ||
        coalesce(NEW.procedure_name, 'a case') || '.',
      NEW.case_id
    );
  end if;

  return NEW;
end;
$$;

drop trigger if exists treatment_plans_notify_hospital on public.treatment_plans;

create trigger treatment_plans_notify_hospital
  after update of status on public.treatment_plans
  for each row
  execute function public.notify_hospital_on_treatment_plan_submission();

-- ─────────────────────────────────────────────────────────
-- Trigger: notify the doctor/hospital on their own provider_message_threads
-- row when MTA Admin sends them a message. Dormant until the Admin Portal
-- (out of scope here) actually writes sender_type = 'admin' rows, same as
-- notify_doctor_on_consultation_request was dormant until the patient-facing
-- consultation-request UI shipped — the trigger itself has no such
-- dependency.
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
    end
  into v_user_id
  from public.provider_message_threads t
  left join public.hospitals h on h.id = t.hospital_id
  left join public.doctors d on d.id = t.doctor_id
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

drop trigger if exists provider_messages_notify_recipient on public.provider_messages;

create trigger provider_messages_notify_recipient
  after insert on public.provider_messages
  for each row
  execute function public.notify_provider_on_admin_message();
