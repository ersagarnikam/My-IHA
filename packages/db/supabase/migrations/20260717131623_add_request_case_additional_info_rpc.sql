-- Doctor "request additional documents" action, available while a case is
-- in evaluation. No separate case status and no MTA Admin message thread —
-- this directly notifies the patient (via the existing notifications table)
-- with the doctor's specified documents/reason. See module 04.

create or replace function public.request_case_additional_info(
  p_case_id uuid,
  p_message text
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor_id        uuid;
  v_case_status      text;
  v_reference_number text;
  v_patient_user_id  uuid;
begin
  select id into v_doctor_id from public.doctors where user_id = auth.uid();
  if v_doctor_id is null then
    raise exception 'unauthorized';
  end if;

  if not exists (
    select 1 from public.doctor_case_assignments
    where case_id = p_case_id and doctor_id = v_doctor_id and status = 'accepted'
  ) then
    raise exception 'case_not_assigned';
  end if;

  select c.status, c.reference_number, p.user_id
  into v_case_status, v_reference_number, v_patient_user_id
  from public.cases c
  join public.patients p on p.id = c.patient_id
  where c.id = p_case_id;

  if v_case_status is null then
    raise exception 'case_not_found';
  end if;
  if v_case_status != 'evaluation' then
    raise exception 'case_not_in_evaluation';
  end if;

  insert into public.notifications (user_id, type, title, message, case_id)
  values (
    v_patient_user_id,
    'additional_info_requested',
    'Your doctor requested additional documents',
    'For case ' || v_reference_number || ': ' || p_message,
    p_case_id
  );
end;
$$;

revoke all on function public.request_case_additional_info(uuid, text) from public;
grant execute on function public.request_case_additional_info(uuid, text) to authenticated;
