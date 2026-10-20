-- RPC for patients to update their own display name (e.g. Apple OAuth first login)

create or replace function public.update_patient_full_name(p_full_name text)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  if length(trim(p_full_name)) < 2 then
    return;
  end if;

  update public.patients
  set full_name = trim(p_full_name)
  where user_id = auth.uid();
end;
$$;

revoke all on function public.update_patient_full_name(text) from public;
grant execute on function public.update_patient_full_name(text) to authenticated;
