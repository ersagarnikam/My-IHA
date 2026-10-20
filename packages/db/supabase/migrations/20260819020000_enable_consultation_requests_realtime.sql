-- Allow clients to subscribe to postgres_changes on consultation_requests
-- (used by the patient case detail page to live-refresh the consultation
-- panel when the doctor proposes or re-proposes slots, instead of requiring
-- a manual page reload).

alter publication supabase_realtime add table public.consultation_requests;
