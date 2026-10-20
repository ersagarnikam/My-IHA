-- Once a patient has paid and the consultation is 'scheduled', the doctor
-- should no longer be able to cancel it from the propose/cancel flow (a
-- paid, confirmed meeting needs a different, more deliberate path — not a
-- one-click cancel). cancel_consultation() previously allowed cancelling
-- from any non-cancelled status, including 'scheduled'. Note
-- propose_consultation_slots() already rejects updating times once
-- 'scheduled' (only 'requested'/'slots_proposed' are valid there), so this
-- closes the matching gap on the cancel side.
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

  if v_status = 'scheduled' then
    raise exception 'already_scheduled';
  end if;

  if p_reason is null or length(trim(p_reason)) = 0 then
    raise exception 'reason_required';
  end if;

  update public.consultation_requests
  set status = 'cancelled', cancellation_reason = p_reason, updated_at = now()
  where id = p_request_id;
end;
$$;
