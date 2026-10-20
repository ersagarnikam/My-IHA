-- Grants doctors read access to the patients behind cases they're assigned
-- to, scoped through doctor_case_assignments — same pattern as the
-- cases/case_documents policies in 20260717131616_add_doctor_case_access_policies.sql.
-- Needed so the doctor case detail page can show patient name/contact/medical
-- background without a service-role bypass.

create policy "Doctors can view assigned patients"
  on public.patients for select
  to authenticated
  using (
    exists (
      select 1
      from public.doctor_case_assignments dca
      join public.doctors d on d.id = dca.doctor_id
      join public.cases c on c.id = dca.case_id
      where c.patient_id = patients.id and d.user_id = auth.uid()
    )
  );
