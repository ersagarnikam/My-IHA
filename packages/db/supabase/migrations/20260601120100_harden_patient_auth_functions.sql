-- Harden trigger functions (search_path + revoke public RPC execute)

create or replace function public.set_updated_at()
returns trigger
language plpgsql
set search_path = ''
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

revoke all on function public.handle_new_patient_user() from public;
revoke all on function public.handle_new_patient_user() from anon, authenticated;
