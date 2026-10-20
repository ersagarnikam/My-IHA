-- ─────────────────────────────────────────────────────────
-- Reference number sequence + generator
-- ─────────────────────────────────────────────────────────
create sequence if not exists public.cases_reference_seq start 1;

create or replace function public.generate_case_reference()
returns text
language sql
as $$
  select 'IHA-' || to_char(now(), 'YYYY') || '-' || lpad(nextval('public.cases_reference_seq')::text, 5, '0');
$$;

-- ─────────────────────────────────────────────────────────
-- cases
-- ─────────────────────────────────────────────────────────
create table public.cases (
  id               uuid        primary key default gen_random_uuid(),
  patient_id       uuid        not null references public.patients (id) on delete cascade,
  reference_number text        not null unique default public.generate_case_reference(),
  specialty        text        not null,
  specialty_other  text,
  description      text        not null,
  status           text        not null default 'case_submitted',
  created_at       timestamptz not null default now(),
  updated_at       timestamptz not null default now(),
  constraint cases_status_check check (status in (
    'case_submitted', 'under_review', 'doctor_assigned', 'evaluation',
    'treatment_plan', 'treatment_confirmed', 'payment_confirmed',
    'visa_processing', 'travel_ready', 'completed', 'closed'
  ))
);

create index on public.cases (patient_id);
create index on public.cases (status);
create index on public.cases (reference_number);

create trigger cases_set_updated_at
  before update on public.cases
  for each row execute function public.set_updated_at();

alter table public.cases enable row level security;

create policy "Patients can view own cases"
  on public.cases for select
  to authenticated
  using (patient_id = (select id from public.patients where user_id = auth.uid()));

create policy "Patients can insert own cases"
  on public.cases for insert
  to authenticated
  with check (patient_id = (select id from public.patients where user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────
-- case_documents
-- ─────────────────────────────────────────────────────────
create table public.case_documents (
  id              uuid        primary key default gen_random_uuid(),
  case_id         uuid        not null references public.cases (id) on delete cascade,
  patient_id      uuid        not null references public.patients (id) on delete cascade,
  file_name       text        not null,
  file_path       text        not null,
  file_size_bytes int8        not null,
  mime_type       text        not null,
  document_type   text        not null default 'other',
  uploaded_at     timestamptz not null default now(),
  constraint case_documents_type_check check (document_type in (
    'lab_report', 'mri_ct', 'xray', 'prescription', 'medical_history', 'other'
  ))
);

create index on public.case_documents (case_id);
create index on public.case_documents (patient_id);

alter table public.case_documents enable row level security;

create policy "Patients can view own case documents"
  on public.case_documents for select
  to authenticated
  using (patient_id = (select id from public.patients where user_id = auth.uid()));

create policy "Patients can insert own case documents"
  on public.case_documents for insert
  to authenticated
  with check (patient_id = (select id from public.patients where user_id = auth.uid()));

-- ─────────────────────────────────────────────────────────
-- notifications
-- ─────────────────────────────────────────────────────────
create table public.notifications (
  id         uuid        primary key default gen_random_uuid(),
  user_id    uuid        not null references auth.users (id) on delete cascade,
  type       text        not null,
  title      text        not null,
  message    text        not null,
  case_id    uuid        references public.cases (id) on delete set null,
  read       boolean     not null default false,
  created_at timestamptz not null default now()
);

create index on public.notifications (user_id, read);
create index on public.notifications (created_at desc);

alter table public.notifications enable row level security;

create policy "Users can view own notifications"
  on public.notifications for select
  to authenticated
  using (user_id = auth.uid());

create policy "Users can insert own notifications"
  on public.notifications for insert
  to authenticated
  with check (user_id = auth.uid());

create policy "Users can update own notifications"
  on public.notifications for update
  to authenticated
  using (user_id = auth.uid());

-- ─────────────────────────────────────────────────────────
-- Storage: case-documents bucket (private, 10 MB, PDF/JPEG/PNG)
-- ─────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'case-documents',
  'case-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png']
)
on conflict (id) do nothing;

create policy "Patients can upload own case documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1] = (
      select id::text from public.patients where user_id = auth.uid()
    )
  );

create policy "Patients can read own case documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'case-documents'
    and (storage.foldername(name))[1] = (
      select id::text from public.patients where user_id = auth.uid()
    )
  );
