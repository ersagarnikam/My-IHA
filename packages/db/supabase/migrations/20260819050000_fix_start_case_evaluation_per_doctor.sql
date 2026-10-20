-- Fix: multiple doctors can be assigned to the same case, each independently
-- evaluating and proposing a treatment plan (Admin later decides which plans
-- reach the patient). start_case_evaluation previously gated the transition
-- on cases.status alone, which is a single column shared by every doctor on
-- the case. The first doctor to start evaluation flipped cases.status from
-- 'doctor_assigned' to 'evaluation', so every other accepted doctor's own
-- start_case_evaluation call then failed with invalid_transition even though
-- they personally hadn't started yet. Evaluation-start state now lives on the
-- doctor's own assignment row, same pattern as plan_submitted_at.

alter table public.doctor_case_assignments
  add column if not exists evaluation_started_at timestamptz;

create or replace function public.start_case_evaluation(p_case_id uuid)
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

  -- 'doctor_assigned' is the pre-evaluation state; 'evaluation' means some
  -- other accepted doctor on this case has already started theirs. Either is
  -- a valid starting point for *this* doctor. Anything further along means
  -- the case has moved on for good (e.g. Admin already routed a plan).
  if v_case_status not in ('doctor_assigned', 'evaluation') then
    raise exception 'invalid_transition';
  end if;

  if v_case_status = 'doctor_assigned' then
    update public.cases set status = 'evaluation', updated_at = now() where id = p_case_id;
  end if;

  update public.doctor_case_assignments
  set evaluation_started_at = now()
  where case_id = p_case_id and doctor_id = v_doctor_id;
end;
$$;
