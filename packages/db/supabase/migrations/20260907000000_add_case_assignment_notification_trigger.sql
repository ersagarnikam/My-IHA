-- Doctor case-assignment notification: notify the doctor in-app when MTA
-- Admin assigns them to a case (insert into doctor_case_assignments). Mirrors
-- notify_doctor_on_consultation_request's shape
-- (20260724121134_add_doctor_consultation_scheduling.sql). Dormant until the
-- Admin Portal's assignment action/RPC actually inserts into
-- doctor_case_assignments — per that table's creating migration
-- (20260717131615_create_doctor_case_assignments.sql), no such insert path
-- exists yet anywhere in this repo. Same "trigger ships ahead of the
-- unbuilt caller" pattern as notify_provider_on_admin_message
-- (20260805000000_add_hospital_doctor_notification_triggers.sql).
create or replace function public.notify_doctor_on_case_assignment()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doctor_user_id uuid;
  v_case_label     text;
begin
  select user_id into v_doctor_user_id from public.doctors where id = NEW.doctor_id;
  if v_doctor_user_id is null then
    return NEW;
  end if;

  select coalesce(specialty_other, specialty) into v_case_label
  from public.cases where id = NEW.case_id;

  insert into public.notifications (user_id, type, title, message, case_id)
  values (
    v_doctor_user_id,
    'case_assigned_by_admin',
    'New case assigned to you',
    'MTA Admin assigned you a new case' ||
      case when v_case_label is not null then ' (' || v_case_label || ').' else '.' end,
    NEW.case_id
  );

  return NEW;
end;
$$;

drop trigger if exists doctor_case_assignments_notify_doctor on public.doctor_case_assignments;

create trigger doctor_case_assignments_notify_doctor
  after insert on public.doctor_case_assignments
  for each row
  execute function public.notify_doctor_on_case_assignment();
