-- Allow clients to subscribe to postgres_changes on notifications (used by
-- the in-portal notification bell/list for real-time updates).

alter publication supabase_realtime add table public.notifications;
