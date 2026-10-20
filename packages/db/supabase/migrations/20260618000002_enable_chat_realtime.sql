-- Allow clients to subscribe to postgres_changes on chat tables

alter publication supabase_realtime add table public.chat_threads;
alter publication supabase_realtime add table public.chat_messages;
