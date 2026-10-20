-- ─────────────────────────────────────────────────────────
-- consultation_requests
-- A patient may request an online consultation with the doctor about a
-- specific (published) treatment option before confirming it. The doctor
-- then proposes 2-3 slots, the patient picks one, and the doctor sends a
-- Zoom link for the chosen time.
-- ─────────────────────────────────────────────────────────
create table public.consultation_requests (
  id                  uuid        primary key default gen_random_uuid(),
  case_id             uuid        not null references public.cases (id) on delete cascade,
  patient_id          uuid        not null references public.patients (id) on delete cascade,
  treatment_option_id uuid        not null references public.treatment_options (id) on delete cascade,
  status              text        not null default 'requested',
  zoom_link           text,
  selected_slot_id    uuid,
  requested_at        timestamptz not null default now(),
  updated_at          timestamptz not null default now(),
  constraint consultation_requests_status_check check (status in (
    'requested', 'slots_proposed', 'slot_selected', 'scheduled', 'cancelled'
  )),
  constraint consultation_requests_treatment_option_unique unique (treatment_option_id)
);

create index on public.consultation_requests (case_id);
create index on public.consultation_requests (patient_id);

create trigger consultation_requests_set_updated_at
  before update on public.consultation_requests
  for each row execute function public.set_updated_at();

alter table public.consultation_requests enable row level security;

create policy "Patients can view own consultation requests"
  on public.consultation_requests for select
  to authenticated
  using (patient_id = (select id from public.patients where user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────
-- consultation_slots
-- Slots proposed by the doctor for a consultation request.
-- ─────────────────────────────────────────────────────────
create table public.consultation_slots (
  id                       uuid        primary key default gen_random_uuid(),
  consultation_request_id  uuid        not null references public.consultation_requests (id) on delete cascade,
  slot_time                timestamptz not null,
  created_at               timestamptz not null default now()
);

create index on public.consultation_slots (consultation_request_id);

alter table public.consultation_slots enable row level security;

create policy "Patients can view own consultation slots"
  on public.consultation_slots for select
  to authenticated
  using (
    consultation_request_id in (
      select cr.id from public.consultation_requests cr
      join public.patients p on p.id = cr.patient_id
      where p.user_id = auth.uid()
    )
  );

alter table public.consultation_requests
  add constraint consultation_requests_selected_slot_fkey
  foreign key (selected_slot_id) references public.consultation_slots (id) on delete set null;

-- ─────────────────────────────────────────────────────────
-- RPC: request_online_consultation
-- Patient requests a consultation about a published treatment option on
-- a case that is still in 'treatment_plan' status. Security definer so it
-- can validate ownership and insert regardless of RLS.
-- ─────────────────────────────────────────────────────────
create or replace function public.request_online_consultation(p_treatment_option_id uuid)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case_id     uuid;
  v_patient_id  uuid;
  v_owns_case   boolean;
  v_case_status text;
  v_request_id  uuid;
begin
  select case_id into v_case_id
  from public.treatment_options
  where id = p_treatment_option_id and published_at is not null;

  if v_case_id is null then
    raise exception 'treatment_option_not_found';
  end if;

  select
    (p.user_id = auth.uid()), c.status, p.id
  into v_owns_case, v_case_status, v_patient_id
  from public.cases c
  join public.patients p on p.id = c.patient_id
  where c.id = v_case_id;

  if not coalesce(v_owns_case, false) then
    raise exception 'unauthorized';
  end if;

  if v_case_status != 'treatment_plan' then
    raise exception 'case_not_in_treatment_plan_status';
  end if;

  if exists (
    select 1 from public.consultation_requests where treatment_option_id = p_treatment_option_id
  ) then
    raise exception 'consultation_already_requested';
  end if;

  insert into public.consultation_requests (case_id, patient_id, treatment_option_id, status)
  values (v_case_id, v_patient_id, p_treatment_option_id, 'requested')
  returning id into v_request_id;

  return v_request_id;
end;
$$;

-- ─────────────────────────────────────────────────────────
-- RPC: select_consultation_slot
-- Patient picks one of the doctor-proposed slots. Only valid while the
-- request is in 'slots_proposed' status.
-- ─────────────────────────────────────────────────────────
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

  if v_status != 'slots_proposed' then
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

-- ─────────────────────────────────────────────────────────
-- Seed: demo consultation requests for the most recent treatment_plan case
-- so the patient-side slot-selection and Zoom-link UI can be exercised
-- before the doctor-side (hospital app) workflow exists.
-- ─────────────────────────────────────────────────────────
do $$
declare
  v_case_id    uuid;
  v_patient_id uuid;
  v_option_1   uuid;
  v_option_2   uuid;
  v_request_1  uuid;
  v_request_2  uuid;
  v_slot_id    uuid;
begin
  select id, patient_id into v_case_id, v_patient_id
  from public.cases
  where status = 'treatment_plan'
  order by created_at desc
  limit 1;

  if v_case_id is null then
    return;
  end if;

  select id into v_option_1 from public.treatment_options
  where case_id = v_case_id order by created_at asc limit 1 offset 0;

  select id into v_option_2 from public.treatment_options
  where case_id = v_case_id order by created_at asc limit 1 offset 1;

  -- Scenario 1: doctor proposed 3 slots, awaiting patient selection
  if v_option_1 is not null
    and not exists (select 1 from public.consultation_requests where treatment_option_id = v_option_1)
  then
    insert into public.consultation_requests (case_id, patient_id, treatment_option_id, status)
    values (v_case_id, v_patient_id, v_option_1, 'slots_proposed')
    returning id into v_request_1;

    insert into public.consultation_slots (consultation_request_id, slot_time) values
      (v_request_1, date_trunc('hour', now()) + interval '2 days' + interval '10 hours'),
      (v_request_1, date_trunc('hour', now()) + interval '3 days' + interval '14 hours'),
      (v_request_1, date_trunc('hour', now()) + interval '4 days' + interval '9 hours');
  end if;

  -- Scenario 2: consultation already scheduled with a Zoom link
  if v_option_2 is not null
    and not exists (select 1 from public.consultation_requests where treatment_option_id = v_option_2)
  then
    insert into public.consultation_requests (case_id, patient_id, treatment_option_id, status, zoom_link)
    values (v_case_id, v_patient_id, v_option_2, 'scheduled', 'https://zoom.us/j/1234567890')
    returning id into v_request_2;

    insert into public.consultation_slots (consultation_request_id, slot_time)
    values (v_request_2, date_trunc('hour', now()) + interval '1 day' + interval '11 hours')
    returning id into v_slot_id;

    update public.consultation_requests set selected_slot_id = v_slot_id where id = v_request_2;
  end if;
end $$;
