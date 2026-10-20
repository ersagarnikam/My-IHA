-- Case status lifecycle rework (doctor portal, module 04/10):
--
-- Previously, accepting an assignment advanced cases.status straight from
-- 'doctor_assigned' to 'evaluation'. MTA Admin (out of scope for this app)
-- is responsible for case_submitted -> under_review -> doctor_assigned;
-- until that's built, a case sits at 'under_review' when a doctor is
-- invited. So acceptance now performs that under_review -> doctor_assigned
-- step itself, and a separate doctor-initiated action (start_case_evaluation)
-- performs doctor_assigned -> evaluation once the doctor is ready to begin.

create or replace function public.respond_to_case_assignment(
  p_assignment_id uuid,
  p_status text,
  p_decline_reason text default null
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_doctor_id      uuid;
  v_case_id        uuid;
  v_current_status text;
  v_case_status    text;
begin
  if p_status not in ('accepted', 'declined', 'withdrawn') then
    raise exception 'invalid_status';
  end if;

  select id into v_doctor_id from public.doctors where user_id = auth.uid();
  if v_doctor_id is null then
    raise exception 'unauthorized';
  end if;

  select dca.case_id, dca.status
  into v_case_id, v_current_status
  from public.doctor_case_assignments dca
  where dca.id = p_assignment_id and dca.doctor_id = v_doctor_id;

  if v_case_id is null then
    raise exception 'assignment_not_found';
  end if;

  if p_status in ('accepted', 'declined') and v_current_status != 'invited' then
    raise exception 'invalid_transition';
  end if;
  if p_status = 'withdrawn' and v_current_status != 'accepted' then
    raise exception 'invalid_transition';
  end if;

  update public.doctor_case_assignments
  set status         = p_status,
      responded_at   = now(),
      decline_reason = case when p_status = 'declined' then p_decline_reason else decline_reason end
  where id = p_assignment_id;

  -- Advance cases.status only on first acceptance, and only from
  -- under_review (the state a case sits in, pre-admin-routing, while
  -- invited doctors haven't yet responded). Multiple doctors can be invited
  -- to the same case; a later acceptance must not regress a case that has
  -- already moved past under_review (e.g. another doctor already accepted,
  -- or the case has progressed further).
  if p_status = 'accepted' then
    select status into v_case_status from public.cases where id = v_case_id;
    if v_case_status = 'under_review' then
      update public.cases set status = 'doctor_assigned', updated_at = now() where id = v_case_id;
    end if;
  end if;
  -- decline/withdraw: no cases.status change — MTA Admin re-routes the case.
end;
$$;

revoke all on function public.respond_to_case_assignment(uuid, text, text) from public;
grant execute on function public.respond_to_case_assignment(uuid, text, text) to authenticated;

-- Doctor-initiated: begin evaluating a case they've accepted. Only valid
-- once the case has actually reached doctor_assigned (i.e. this doctor's
-- acceptance is the one that's active on the case).
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
  if v_case_status != 'doctor_assigned' then
    raise exception 'invalid_transition';
  end if;

  update public.cases set status = 'evaluation', updated_at = now() where id = p_case_id;
end;
$$;

revoke all on function public.start_case_evaluation(uuid) from public;
grant execute on function public.start_case_evaluation(uuid) to authenticated;
