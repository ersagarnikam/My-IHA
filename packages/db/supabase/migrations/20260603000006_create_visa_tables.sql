-- visa_submissions: one row per case, created on patient's first upload
create table public.visa_submissions (
  id                 uuid        primary key default gen_random_uuid(),
  case_id            uuid        not null unique references public.cases(id) on delete cascade,
  patient_id         uuid        not null references public.patients(id) on delete cascade,
  assigned_lawyer_id uuid,
  status             text        not null default 'not_started',
  lawyer_notes       text,
  created_at         timestamptz not null default now(),
  updated_at         timestamptz not null default now()
);

alter table public.visa_submissions enable row level security;

create policy "Patients read own visa submissions"
  on public.visa_submissions for select
  using (auth.uid() = (select user_id from public.patients where id = patient_id));

create policy "Patients insert own visa submissions"
  on public.visa_submissions for insert
  with check (auth.uid() = (select user_id from public.patients where id = patient_id));

create trigger visa_submissions_set_updated_at
  before update on public.visa_submissions
  for each row execute function public.set_updated_at();

create index on public.visa_submissions(case_id);
create index on public.visa_submissions(patient_id);

-- visa_documents: one row per uploaded file, grouped by category
create table public.visa_documents (
  id                  uuid        primary key default gen_random_uuid(),
  visa_submission_id  uuid        not null references public.visa_submissions(id) on delete cascade,
  patient_id          uuid        not null references public.patients(id) on delete cascade,
  category            text        not null,
  file_name           text        not null,
  file_path           text        not null,
  file_size_bytes     int8,
  mime_type           text,
  uploaded_at         timestamptz not null default now(),
  requested_by_lawyer boolean     not null default false
);

alter table public.visa_documents enable row level security;

create policy "Patients read own visa documents"
  on public.visa_documents for select
  using (auth.uid() = (select user_id from public.patients where id = patient_id));

create policy "Patients insert own visa documents"
  on public.visa_documents for insert
  with check (auth.uid() = (select user_id from public.patients where id = patient_id));

create index on public.visa_documents(visa_submission_id);
create index on public.visa_documents(patient_id);
