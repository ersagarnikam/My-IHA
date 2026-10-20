-- ─────────────────────────────────────────────────────────
-- Storage: registration-documents bucket (private, 10 MB, PDF/JPEG/PNG/DOC/DOCX)
-- Shared by both registration wizards (hospital certificates, doctor profile
-- photo). Mirrors the case-documents bucket pattern, but scoped by
-- auth.uid() rather than a patient/case id — the hospitals/doctors row
-- doesn't exist yet when these uploads happen, since the wizard creates the
-- auth account first and only inserts the row on final submit.
-- ─────────────────────────────────────────────────────────
insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'registration-documents',
  'registration-documents',
  false,
  10485760,
  array[
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
  ]
)
on conflict (id) do nothing;

create policy "Users can upload own registration documents"
  on storage.objects for insert
  to authenticated
  with check (
    bucket_id = 'registration-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

create policy "Users can read own registration documents"
  on storage.objects for select
  to authenticated
  using (
    bucket_id = 'registration-documents'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
