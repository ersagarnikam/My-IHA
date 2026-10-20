-- Doctor-triggered case completion (module 10 follow-up): once a case has
-- reached payment_confirmed and the patient has actually travelled and
-- undergone treatment at the hospital, there was no way to record that —
-- every status transition past evaluation was reserved for MTA Admin
-- (out of scope for this app), so cases just sat at travel_ready forever.
-- Mirrors start_case_evaluation's shape (20260721010000): the assigned
-- doctor is the one who knows treatment actually happened, so they own
-- this transition directly.
create or replace function public.mark_case_completed(p_case_id uuid)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor_id         uuid;
  v_assignment_status text;
  v_case_status       text;
begin
  select id into v_doctor_id from public.doctors where user_id = auth.uid();
  if v_doctor_id is null then
    raise exception 'unauthorized';
  end if;

  select status into v_assignment_status
  from public.doctor_case_assignments
  where case_id = p_case_id and doctor_id = v_doctor_id;

  if v_assignment_status is null or v_assignment_status != 'accepted' then
    raise exception 'unauthorized';
  end if;

  select status into v_case_status from public.cases where id = p_case_id;
  if v_case_status is null or v_case_status not in ('payment_confirmed', 'visa_processing', 'travel_ready') then
    raise exception 'invalid_transition';
  end if;

  update public.cases set status = 'completed', updated_at = now() where id = p_case_id;
end;
$$;

revoke all on function public.mark_case_completed(uuid) from public;
grant execute on function public.mark_case_completed(uuid) to authenticated;
