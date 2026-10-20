-- Audit trail for compliance-relevant events (auth, profile/account changes,
-- payments) across all apps. Writes go through log_audit_event() so the
-- actor is always derived server-side from the caller's session; there are
-- no select/insert policies for anon/authenticated, so reads (e.g. a future
-- admin viewer) go through the service role.
create table public.audit_logs (
  id          uuid        primary key default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  app         text        not null,
  action      text        not null,
  actor_id    uuid        references auth.users (id) on delete set null,
  actor_email text,
  entity_type text,
  entity_id   text,
  metadata    jsonb       not null default '{}'::jsonb
);

create index audit_logs_actor_id_idx on public.audit_logs (actor_id);
create index audit_logs_created_at_idx on public.audit_logs (created_at desc);
create index audit_logs_action_idx on public.audit_logs (action);

alter table public.audit_logs enable row level security;

create or replace function public.log_audit_event(
  p_app text,
  p_action text,
  p_entity_type text default null,
  p_entity_id text default null,
  p_metadata jsonb default '{}'::jsonb
)
returns void
language plpgsql
security definer
set search_path = ''
as $$
begin
  insert into public.audit_logs (app, action, actor_id, actor_email, entity_type, entity_id, metadata)
  values (
    p_app,
    p_action,
    auth.uid(),
    (auth.jwt() ->> 'email'),
    p_entity_type,
    p_entity_id,
    coalesce(p_metadata, '{}'::jsonb)
  );
end;
$$;

revoke execute on function public.log_audit_event from public;
-- anon is required for pre-session events (e.g. failed login attempts)
grant execute on function public.log_audit_event to authenticated, anon;
