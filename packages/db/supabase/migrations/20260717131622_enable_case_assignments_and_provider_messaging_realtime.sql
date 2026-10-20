-- Allow clients to subscribe to postgres_changes on the new module 04/09
-- tables — doctor_case_assignments so /cases can live-update when MTA Admin
-- routes a new case, provider_messages/threads for the realtime chat UI.

alter publication supabase_realtime add table public.doctor_case_assignments;
alter publication supabase_realtime add table public.provider_message_threads;
alter publication supabase_realtime add table public.provider_messages;
