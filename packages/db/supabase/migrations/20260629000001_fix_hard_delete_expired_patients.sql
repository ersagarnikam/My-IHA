-- The pg_cron job introduced in 20260612000004 deletes directly from
-- storage.objects, which Supabase now blocks ("Direct deletion from storage
-- tables is not allowed. Use the Storage API instead."). That error rolled
-- back the whole function -- including the auth.users delete -- so expired
-- patients were never actually removed. Hard-deletion is moved to the
-- "hard-delete-expired-patients" Edge Function (packages/db/supabase/functions),
-- which uses the Storage API directly and is invoked on a Cron Trigger.

do $$
begin
  if exists (select 1 from cron.job where jobname = 'hard-delete-expired-patients') then
    perform cron.unschedule('hard-delete-expired-patients');
  end if;
end
$$;

drop function if exists public.hard_delete_expired_patients();

-- Read-only lookup of storage object names under a patient's folder so the
-- Edge Function can delete them via the Storage API. Listing rows in
-- storage.objects is unaffected by the delete restriction above.
create or replace function public.get_storage_object_names(p_bucket_id text, p_folder text)
returns text[]
language sql
security definer
set search_path = ''
stable
as $$
  select coalesce(array_agg(name), array[]::text[])
  from storage.objects
  where bucket_id = p_bucket_id
    and (storage.foldername(name))[1] = p_folder;
$$;

revoke all on function public.get_storage_object_names(text, text) from public, anon, authenticated;
grant execute on function public.get_storage_object_names(text, text) to service_role;
