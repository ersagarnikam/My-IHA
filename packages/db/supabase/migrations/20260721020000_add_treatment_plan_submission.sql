-- Minimal tracking for a doctor submitting their treatment plan to MTA
-- Admin. There's no treatment-plan authoring feature yet (that's a
-- follow-up task) — this just records that the doctor is done with
-- evaluation and has handed the case off, so the doctor portal can show a
-- "Treatment Plan Sent" state without touching cases.status (Admin, out of
-- scope here, is the one who actually routes the plan to the patient and
-- advances cases.status to 'treatment_plan').

alter table public.doctor_case_assignments
  add column if not exists plan_submitted_at timestamptz;

create or replace function public.submit_treatment_plan_to_admin(p_case_id uuid)
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
  if v_case_status != 'evaluation' then
    raise exception 'invalid_transition';
  end if;

  update public.doctor_case_assignments
  set plan_submitted_at = now()
  where case_id = p_case_id and doctor_id = v_doctor_id;
end;
$$;

revoke all on function public.submit_treatment_plan_to_admin(uuid) from public;
grant execute on function public.submit_treatment_plan_to_admin(uuid) to authenticated;
