-- Doctor case assignments: a case routed to one or more doctors, each
-- independently accepting/declining. See hospital-portal module 04.

create table public.doctor_case_assignments (
  id             uuid        primary key default gen_random_uuid(),
  case_id        uuid        not null references public.cases (id) on delete cascade,
  doctor_id      uuid        not null references public.doctors (id) on delete cascade,
  status         text        not null default 'invited',
  decline_reason text,
  invited_at     timestamptz not null default now(),
  responded_at   timestamptz,
  constraint doctor_case_assignments_status_check
    check (status in ('invited', 'accepted', 'declined', 'withdrawn')),
  constraint doctor_case_assignments_case_doctor_key unique (case_id, doctor_id)
);

create index on public.doctor_case_assignments (doctor_id);
create index on public.doctor_case_assignments (case_id);

alter table public.doctor_case_assignments enable row level security;

-- No insert policy: rows are only ever created by MTA Admin (service role /
-- Admin Portal RPC, not built in this app). No update policy either — status
-- transitions go exclusively through respond_to_case_assignment() so the
-- responded_at bookkeeping and invited/accepted/withdrawn transition rules
-- can't be bypassed by a direct client update (same "RPC-only writes"
-- pattern already used on `cases`).
create policy "Doctors can view own assignments"
  on public.doctor_case_assignments for select
  to authenticated
  using (doctor_id in (select id from public.doctors where user_id = auth.uid()));
