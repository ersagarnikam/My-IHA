-- Allow patients to update their own case_documents rows (e.g. linking a
-- standalone document to a case after upload).
create policy "Patients can update own case documents"
  on public.case_documents for update
  to authenticated
  using (patient_id = (select id from public.patients where user_id = auth.uid()))
  with check (patient_id = (select id from public.patients where user_id = auth.uid()));
