-- Admin tools: suspending an account, and why a case was closed.
alter table app_users add column suspended_at timestamp with time zone;
alter table app_users add column suspended_reason varchar;
alter table cases add column closed_reason varchar;
