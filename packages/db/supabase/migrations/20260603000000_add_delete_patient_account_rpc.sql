-- Allows a patient to fully delete their own account, including storage files.
-- Execution order:
--   1. Delete storage objects (case-documents bucket, avatars bucket)
--   2. Delete auth.users row → cascades: patients → cases → case_documents
create or replace function public.delete_patient_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id  uuid := auth.uid();
  v_patient_id uuid;
begin
  -- Resolve the patients.id (used as the storage folder prefix for case-documents)
  select id into v_patient_id
  from public.patients
  where user_id = v_user_id;

  -- Delete all case documents from storage
  if v_patient_id is not null then
    delete from storage.objects
    where bucket_id = 'case-documents'
      and (storage.foldername(name))[1] = v_patient_id::text;
  end if;

  -- Delete avatar from storage
  delete from storage.objects
  where bucket_id = 'avatars'
    and (storage.foldername(name))[1] = v_user_id::text;

  -- Delete the auth user — cascades to patients → cases → case_documents rows
  delete from auth.users where id = v_user_id;
end;
$$;

-- Only authenticated users can call this
revoke execute on function public.delete_patient_account() from public;
grant execute on function public.delete_patient_account() to authenticated;
