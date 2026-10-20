-- ─────────────────────────────────────────────────────────
-- hospitals
-- ─────────────────────────────────────────────────────────
create table public.hospitals (
  id         uuid        primary key default gen_random_uuid(),
  name       text        not null,
  city       text        not null,
  country    text        not null,
  logo_url   text,
  created_at timestamptz not null default now()
);

alter table public.hospitals enable row level security;

create policy "Authenticated users can read hospitals"
  on public.hospitals for select
  to authenticated
  using (true);

-- ─────────────────────────────────────────────────────────
-- doctors
-- ─────────────────────────────────────────────────────────
create table public.doctors (
  id             uuid        primary key default gen_random_uuid(),
  hospital_id    uuid        not null references public.hospitals (id) on delete cascade,
  full_name      text        not null,
  specialty      text        not null,
  qualifications text,
  photo_url      text,
  created_at     timestamptz not null default now()
);

alter table public.doctors enable row level security;

create policy "Authenticated users can read doctors"
  on public.doctors for select
  to authenticated
  using (true);

-- ─────────────────────────────────────────────────────────
-- treatment_options
-- ─────────────────────────────────────────────────────────
create table public.treatment_options (
  id                         uuid        primary key default gen_random_uuid(),
  case_id                    uuid        not null references public.cases (id) on delete cascade,
  treatment_plan_id          uuid,
  hospital_id                uuid        not null references public.hospitals (id),
  doctor_id                  uuid        not null references public.doctors (id),
  treatment_summary          text        not null,
  cost_breakdown             jsonb       not null default '{}',
  estimated_duration_days    int4,
  estimated_timeline         text,
  pre_treatment_requirements text,
  is_selected                boolean     not null default false,
  published_at               timestamptz,
  created_at                 timestamptz not null default now()
);

create index on public.treatment_options (case_id);

alter table public.treatment_options enable row level security;

create policy "Patients can read own published treatment options"
  on public.treatment_options for select
  to authenticated
  using (
    published_at is not null
    and case_id in (
      select c.id from public.cases c
      join public.patients p on p.id = c.patient_id
      where p.user_id = auth.uid()
    )
  );

-- ─────────────────────────────────────────────────────────
-- RPC: confirm_treatment_option
-- Atomically marks one option as selected and transitions the case.
-- Uses security definer so it can update both tables regardless of RLS.
-- ─────────────────────────────────────────────────────────
create or replace function public.confirm_treatment_option(p_option_id uuid)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_case_id     uuid;
  v_case_status text;
  v_owns_case   boolean;
begin
  select case_id into v_case_id
  from public.treatment_options
  where id = p_option_id and published_at is not null;

  if v_case_id is null then
    raise exception 'treatment_option_not_found';
  end if;

  select
    (p.user_id = auth.uid()),
    c.status
  into v_owns_case, v_case_status
  from public.cases c
  join public.patients p on p.id = c.patient_id
  where c.id = v_case_id;

  if not coalesce(v_owns_case, false) then
    raise exception 'unauthorized';
  end if;

  if v_case_status != 'treatment_plan' then
    raise exception 'case_not_in_treatment_plan_status';
  end if;

  update public.treatment_options
  set is_selected = true
  where id = p_option_id;

  update public.cases
  set status = 'treatment_confirmed', updated_at = now()
  where id = v_case_id;
end;
$$;

-- ─────────────────────────────────────────────────────────
-- Seed: hospitals
-- ─────────────────────────────────────────────────────────
insert into public.hospitals (id, name, city, country) values
  ('a1b2c3d4-1111-1111-1111-000000000001', 'Apollo Hospitals',                  'Chennai',   'India'),
  ('a1b2c3d4-1111-1111-1111-000000000002', 'Bumrungrad International Hospital', 'Bangkok',   'Thailand'),
  ('a1b2c3d4-1111-1111-1111-000000000003', 'Fortis Healthcare',                 'New Delhi', 'India'),
  ('a1b2c3d4-1111-1111-1111-000000000004', 'Medicana International Hospital',   'Istanbul',  'Turkey'),
  ('a1b2c3d4-1111-1111-1111-000000000005', 'Mount Elizabeth Hospital',          'Singapore', 'Singapore')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────
-- Seed: doctors
-- ─────────────────────────────────────────────────────────
insert into public.doctors (id, hospital_id, full_name, specialty, qualifications) values
  ('b1c2d3e4-1111-1111-1111-000000000001', 'a1b2c3d4-1111-1111-1111-000000000001', 'Dr. Rajesh Sharma',    'Cardiothoracic Surgery', 'MBBS, MS, MCh'),
  ('b1c2d3e4-1111-1111-1111-000000000002', 'a1b2c3d4-1111-1111-1111-000000000002', 'Dr. Somchai Wongsawat','Orthopaedics',           'MD, FRCS'),
  ('b1c2d3e4-1111-1111-1111-000000000003', 'a1b2c3d4-1111-1111-1111-000000000003', 'Dr. Priya Mehta',      'Neurology',              'MBBS, DM, FRCP'),
  ('b1c2d3e4-1111-1111-1111-000000000004', 'a1b2c3d4-1111-1111-1111-000000000004', 'Dr. Ahmet Yilmaz',     'Oncology',               'MD, PhD'),
  ('b1c2d3e4-1111-1111-1111-000000000005', 'a1b2c3d4-1111-1111-1111-000000000005', 'Dr. Lee Wei Ling',     'Gastroenterology',       'MBBS, FRCP, FAMS')
on conflict (id) do nothing;

-- ─────────────────────────────────────────────────────────
-- Seed: treatment_options (dev/demo — attached to newest case)
-- ─────────────────────────────────────────────────────────
do $$
declare
  v_case_id uuid;
begin
  select id into v_case_id
  from public.cases
  order by created_at desc
  limit 1;

  if v_case_id is null then
    return;
  end if;

  update public.cases set status = 'treatment_plan', updated_at = now()
  where id = v_case_id;

  insert into public.treatment_options (
    case_id, hospital_id, doctor_id,
    treatment_summary, cost_breakdown,
    estimated_duration_days, estimated_timeline,
    pre_treatment_requirements, is_selected, published_at
  ) values
  (
    v_case_id,
    'a1b2c3d4-1111-1111-1111-000000000001',
    'b1c2d3e4-1111-1111-1111-000000000001',
    'Coronary artery bypass grafting (CABG) using a minimally invasive technique. Three-vessel disease treated with saphenous vein grafts. ICU monitoring for 48 hours post-procedure followed by a structured physiotherapy programme.',
    '{"doctor_fees": 4500, "hospital_fees": 12000, "specialist_fees": 2800, "additional_costs": 1200, "iha_commission": 6150, "total": 26650}',
    35, '4–6 weeks',
    'Cease blood thinners 7 days prior to admission. Echocardiogram and stress test required before surgery.',
    false, now()
  ),
  (
    v_case_id,
    'a1b2c3d4-1111-1111-1111-000000000002',
    'b1c2d3e4-1111-1111-1111-000000000002',
    'Total knee replacement using a robotic-assisted surgical system for optimal implant alignment. Plan includes 3 weeks of post-operative physiotherapy and a personalised pain management protocol.',
    '{"doctor_fees": 3200, "hospital_fees": 8500, "specialist_fees": 1800, "additional_costs": 900, "iha_commission": 4320, "total": 18720}',
    28, '3–4 weeks',
    'BMI must be below 40. A pre-operative physiotherapy assessment is required at least 2 weeks before admission.',
    false, now()
  ),
  (
    v_case_id,
    'a1b2c3d4-1111-1111-1111-000000000003',
    'b1c2d3e4-1111-1111-1111-000000000003',
    'Comprehensive neurological evaluation and targeted treatment for chronic condition management. Includes MRI brain and spine, 72-hour EEG monitoring, and a multi-disciplinary specialist review.',
    '{"doctor_fees": 2800, "hospital_fees": 6200, "specialist_fees": 1500, "additional_costs": 600, "iha_commission": 3330, "total": 14430}',
    14, '2 weeks',
    'Bring all previous MRI and CT scan reports. A complete current medication list is required at admission.',
    false, now()
  )
  on conflict do nothing;
end $$;
