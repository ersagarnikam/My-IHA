-- patients profile table + RLS + auto-create on auth signup

-- Reusable updated_at trigger function
create or replace function public.set_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

-- patients
create table public.patients (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users (id) on delete cascade,
  full_name text not null,
  date_of_birth date,
  gender text check (
    gender is null
    or gender in ('male', 'female', 'other', 'prefer_not_to_say')
  ),
  nationality text,
  country_of_residence text,
  phone text,
  address text,
  medical_history text,
  allergies text[] default '{}',
  current_medications text[] default '{}',
  past_surgeries text,
  emergency_contact_name text,
  emergency_contact_relationship text,
  emergency_contact_phone text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  constraint patients_user_id_key unique (user_id)
);

create index patients_user_id_idx on public.patients (user_id);

create trigger patients_set_updated_at
  before update on public.patients
  for each row
  execute function public.set_updated_at();

alter table public.patients enable row level security;

create policy "Patients can view own profile"
  on public.patients
  for select
  to authenticated
  using (auth.uid() = user_id);

create policy "Patients can insert own profile"
  on public.patients
  for insert
  to authenticated
  with check (auth.uid() = user_id);

create policy "Patients can update own profile"
  on public.patients
  for update
  to authenticated
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- Create a patients row when a new auth user registers (email or OAuth)
create or replace function public.handle_new_patient_user()
returns trigger
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_full_name text;
begin
  v_full_name := coalesce(
    nullif(trim(new.raw_user_meta_data ->> 'full_name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'name'), ''),
    nullif(trim(new.raw_user_meta_data ->> 'fullName'), ''),
    split_part(coalesce(new.email, ''), '@', 1)
  );

  if v_full_name = '' then
    v_full_name := 'Patient';
  end if;

  insert into public.patients (user_id, full_name)
  values (new.id, v_full_name)
  on conflict (user_id) do nothing;

  return new;
end;
$$;

create trigger on_auth_user_created_patient
  after insert on auth.users
  for each row
  execute function public.handle_new_patient_user();

comment on table public.patients is 'Patient profile — one row per registered user in the patient portal';
