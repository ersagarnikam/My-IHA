-- ─────────────────────────────────────────────────────────
-- RPC: schedule_consultation_meeting
-- Called after the patient selects a slot and the patient app creates a
-- Zoom meeting for that time via the Zoom API. Stores the resulting join
-- link and marks the consultation as scheduled.
-- ─────────────────────────────────────────────────────────
create or replace function public.schedule_consultation_meeting(p_request_id uuid, p_zoom_link text)
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

  if v_status != 'slot_selected' then
    raise exception 'consultation_not_awaiting_schedule';
  end if;

  update public.consultation_requests
  set zoom_link = p_zoom_link, status = 'scheduled', updated_at = now()
  where id = p_request_id;
end;
$$;
