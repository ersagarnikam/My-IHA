-- Hide soft-deleted patients (and their cases/documents/visa records) from
-- every portal by tightening the existing RLS select policies.

-- patients
drop policy if exists "Patients can view own profile" on public.patients;

create policy "Patients can view own profile"
  on public.patients
  for select
  to authenticated
  using (auth.uid() = user_id and not is_deleted);

-- cases
drop policy if exists "Patients can view own cases" on public.cases;

create policy "Patients can view own cases"
  on public.cases
  for select
  to authenticated
  using (
    patient_id = (
      select id from public.patients
      where user_id = auth.uid() and not is_deleted
    )
  );

-- case_documents
drop policy if exists "Patients can view own case documents" on public.case_documents;

create policy "Patients can view own case documents"
  on public.case_documents
  for select
  to authenticated
  using (
    patient_id = (
      select id from public.patients
      where user_id = auth.uid() and not is_deleted
    )
  );

-- visa_submissions
drop policy if exists "Patients read own visa submissions" on public.visa_submissions;

create policy "Patients read own visa submissions"
  on public.visa_submissions
  for select
  using (
    auth.uid() = (
      select user_id from public.patients
      where id = patient_id and not is_deleted
    )
  );

-- visa_documents
drop policy if exists "Patients read own visa documents" on public.visa_documents;

create policy "Patients read own visa documents"
  on public.visa_documents
  for select
  using (
    auth.uid() = (
      select user_id from public.patients
      where id = patient_id and not is_deleted
    )
  );

-- payments
drop policy if exists "Patients can view own payments" on public.payments;

create policy "Patients can view own payments"
  on public.payments
  for select
  to authenticated
  using (
    auth.uid() = (
      select user_id from public.patients
      where id = patient_id and not is_deleted
    )
  );

-- treatment_options
drop policy if exists "Patients can read own published treatment options" on public.treatment_options;

create policy "Patients can read own published treatment options"
  on public.treatment_options
  for select
  to authenticated
  using (
    published_at is not null
    and case_id in (
      select c.id from public.cases c
      join public.patients p on p.id = c.patient_id
      where p.user_id = auth.uid() and not p.is_deleted
    )
  );
