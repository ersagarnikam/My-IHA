-- Patients must be able to update their own visa submissions (for form_data / status)
create policy "Patients update own visa submissions"
  on public.visa_submissions for update
  using (auth.uid() = (select user_id from public.patients where id = patient_id));

-- Create visa-documents private storage bucket
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'visa-documents',
  'visa-documents',
  false,
  10485760,
  array['application/pdf', 'image/jpeg', 'image/png', 'image/webp']
)
on conflict (id) do nothing;

-- Storage RLS: first path segment must match the authenticated user's ID
create policy "Patients upload own visa documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'visa-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Patients read own visa documents in storage"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'visa-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
