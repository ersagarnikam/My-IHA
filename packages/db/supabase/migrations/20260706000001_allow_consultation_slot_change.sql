-- Allow a patient to change their previously chosen consultation slot while
-- still in 'slot_selected' status (i.e. before the consultation fee payment
-- succeeds and flips the request to 'scheduled'). Previously this RPC only
-- accepted the initial pick made from 'slots_proposed'.
create or replace function public.select_consultation_slot(p_request_id uuid, p_slot_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owns_request boolean;
  v_status       text;
begin
  select (p.user_id = auth.uid()), cr.status
  into v_owns_request, v_status
  from public.consultation_requests cr
  join public.patients p on p.id = cr.patient_id
  where cr.id = p_request_id;

  if v_status is null then
    raise exception 'consultation_request_not_found';
  end if;

  if not coalesce(v_owns_request, false) then
    raise exception 'unauthorized';
  end if;

  if v_status not in ('slots_proposed', 'slot_selected') then
    raise exception 'consultation_not_awaiting_slot_selection';
  end if;

  if not exists (
    select 1 from public.consultation_slots
    where id = p_slot_id and consultation_request_id = p_request_id
  ) then
    raise exception 'slot_not_found';
  end if;

  update public.consultation_requests
  set selected_slot_id = p_slot_id, status = 'slot_selected', updated_at = now()
  where id = p_request_id;
end;
$$;
