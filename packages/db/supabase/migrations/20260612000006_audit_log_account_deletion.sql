-- Record account soft-deletion in the audit trail. log_audit_event() runs
-- security definer and resolves the actor from auth.uid(), which still
-- points at the deleting user within this same transaction.
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

  perform public.log_audit_event('patient', 'patient.account_deleted', 'patient', v_user_id::text, '{}'::jsonb);
end;
$$;

revoke execute on function public.delete_patient_account() from public;
grant execute on function public.delete_patient_account() to authenticated;
