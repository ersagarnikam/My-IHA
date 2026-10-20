-- Allow clients to subscribe to postgres_changes on cases (used by the case
-- detail page to live-refresh the Status Timeline when the case status
-- changes, instead of requiring a manual page reload).

alter publication supabase_realtime add table public.cases;
