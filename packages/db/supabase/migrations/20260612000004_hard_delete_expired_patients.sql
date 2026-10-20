-- Permanently deletes patients (and cascaded cases, case documents, visa
-- submissions/documents, payment methods, storage files and the auth user)
-- once their 30-day soft-delete retention window has passed.
create or replace function public.hard_delete_expired_patients()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  r record;
begin
  for r in
    select id, user_id
    from public.patients
    where is_deleted = true
      and scheduled_delete_at <= now()
  loop
    -- Case documents
    delete from storage.objects
    where bucket_id = 'case-documents'
      and (storage.foldername(name))[1] = r.id::text;

    -- Visa documents (stored under the auth user's id)
    delete from storage.objects
    where bucket_id = 'visa-documents'
      and (storage.foldername(name))[1] = r.user_id::text;

    -- Avatar
    delete from storage.objects
    where bucket_id = 'avatars'
      and (storage.foldername(name))[1] = r.user_id::text;

    -- Deleting the auth user cascades to patients -> cases -> case_documents,
    -- visa_submissions -> visa_documents, payment_methods, notifications, etc.
    delete from auth.users where id = r.user_id;
  end loop;
end;
$$;

revoke all on function public.hard_delete_expired_patients() from public, anon, authenticated;

-- Schedule a daily sweep for accounts past their retention window
create extension if not exists pg_cron;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'hard-delete-expired-patients') then
    perform cron.unschedule('hard-delete-expired-patients');
  end if;
end
$$;

select cron.schedule(
  'hard-delete-expired-patients',
  '0 3 * * *',
  $$select public.hard_delete_expired_patients();$$
);
