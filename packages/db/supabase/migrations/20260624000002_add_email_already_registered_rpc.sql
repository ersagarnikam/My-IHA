-- Lets server-side code check whether an email is already registered before
-- calling supabase.auth.signUp(). GoTrue's own email-enumeration protection
-- makes signUp() succeed silently for an already-registered email, so the
-- app can't tell from that response alone - this RPC is the only reliable
-- signal, and is restricted to service_role since it must never be callable
-- by a logged-in user probing other people's emails.
create or replace function public.email_already_registered(p_email text)
returns boolean
language sql
stable
security definer
set search_path = ''
as $$
  select exists (
    select 1 from auth.users where lower(email) = lower(p_email)
  );
$$;

revoke all on function public.email_already_registered(text) from public, anon, authenticated;
grant execute on function public.email_already_registered(text) to service_role;
