-- delete_patient_account() was setting auth.users.banned_until to the literal
-- 'infinity' timestamp. Postgres accepts 'infinity' as a sentinel value, but
-- GoTrue (Supabase Auth) cannot decode it into a time.Time, so any admin API
-- call that loads the row -- including auth.admin.deleteUser(), used by the
-- hard-delete-expired-patients Edge Function -- fails with a 500
-- "Database error loading user". Use a concrete far-future date instead.

update auth.users
set banned_until = '2099-12-31 23:59:59+00'
where banned_until = 'infinity';

create or replace function public.delete_patient_account()
returns void
language plpgsql
security definer
set search_path = ''
as $$
declare
  v_user_id uuid := auth.uid();
begin
  update public.patients
  set is_deleted = true,
      deleted_at = now(),
      scheduled_delete_at = now() + interval '30 days'
  where user_id = v_user_id
    and not is_deleted;

  -- Disable login for this account. A concrete far-future date is used
  -- instead of 'infinity' -- GoTrue cannot decode that sentinel value.
  update auth.users
  set banned_until = '2099-12-31 23:59:59+00'
  where id = v_user_id;
end;
$$;

revoke execute on function public.delete_patient_account() from public;
grant execute on function public.delete_patient_account() to authenticated;
