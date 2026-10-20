-- Doctor accept/decline/withdraw on a case assignment. Mirrors the
-- confirm_treatment_option() pattern: ownership check + precondition
-- validation + all writes inside one security-definer transaction, so a
-- direct client update can never bypass the transition rules. See module 04.

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

  -- Advance cases.status only on first acceptance (module 10: status moves
  -- to `evaluation` when the first doctor accepts). Multiple doctors can be
  -- invited to the same case; a later acceptance must not regress a case
  -- that has already moved past doctor_assigned (e.g. to treatment_plan).
  if p_status = 'accepted' then
    select status into v_case_status from public.cases where id = v_case_id;
    if v_case_status = 'doctor_assigned' then
      update public.cases set status = 'evaluation', updated_at = now() where id = v_case_id;
    end if;
  end if;
  -- decline/withdraw: no cases.status change — MTA Admin re-routes the case.
end;
$$;

revoke all on function public.respond_to_case_assignment(uuid, text, text) from public;
grant execute on function public.respond_to_case_assignment(uuid, text, text) to authenticated;
