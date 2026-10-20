-- Replaces the hard-delete account RPC with a soft delete: the patient row
-- is flagged (with a 30-day retention window) and the auth account is
-- banned so the patient can no longer log in. Permanent removal happens
-- later via public.hard_delete_expired_patients().
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

  -- Disable login for this account
  update auth.users
  set banned_until = 'infinity'
  where id = v_user_id;
end;
$$;

revoke execute on function public.delete_patient_account() from public;
grant execute on function public.delete_patient_account() to authenticated;
