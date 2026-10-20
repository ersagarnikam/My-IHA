-- ─────────────────────────────────────────────────────────
-- Patient-reported travel/stay assistance flags
-- ─────────────────────────────────────────────────────────
alter table public.cases
  add column need_travel_assistance boolean not null default false,
  add column need_stay_booking_assistance boolean not null default false;

-- RPC: update_case_travel_assistance
-- Patients have no UPDATE policy on cases (status and other fields are
-- app/trigger-driven only), so this flag update goes through a security
-- definer RPC that re-validates ownership and the travel_ready status
-- itself, mirroring confirm_treatment_option.
create or replace function public.update_case_travel_assistance(
  p_case_id uuid,
  p_need_travel_assistance boolean,
  p_need_stay_booking_assistance boolean
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owns_case   boolean;
  v_case_status text;
begin
  select (p.user_id = auth.uid()), c.status
  into v_owns_case, v_case_status
  from public.cases c
  join public.patients p on p.id = c.patient_id
  where c.id = p_case_id;

  if v_case_status is null then
    raise exception 'case_not_found';
  end if;

  if not coalesce(v_owns_case, false) then
    raise exception 'unauthorized';
  end if;

  if v_case_status != 'travel_ready' then
    raise exception 'case_not_travel_ready';
  end if;

  update public.cases
  set
    need_travel_assistance = p_need_travel_assistance,
    need_stay_booking_assistance = p_need_stay_booking_assistance
  where id = p_case_id;
end;
$$;

revoke all on function public.update_case_travel_assistance(uuid, boolean, boolean) from public;
grant execute on function public.update_case_travel_assistance(uuid, boolean, boolean) to authenticated;
