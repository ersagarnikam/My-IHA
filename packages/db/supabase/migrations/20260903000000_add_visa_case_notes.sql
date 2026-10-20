-- Visa Lawyer Portal: internal case notes (SOW Module 5.2 "Application Notes").
-- visa_submissions.lawyer_notes (20260603000006) is a single text column
-- that was only ever wired into the *patient-facing* UI
-- (apps/patient/.../visa-travel) — the opposite of the SOW requirement that
-- these notes are "visible only to the lawyer and MTA Admin (never the
-- patient)" — and it has never been written by any code (no lawyer app
-- existed yet). Rather than repurpose a patient-visible dead column for
-- confidential lawyer notes, this adds a dedicated append-only table (a
-- timestamped log per case, as the SOW requires — a single column can't
-- hold more than the latest note) and drops the old column along with its
-- dead read paths.
--
-- No MTA Admin RLS policy is added here: there is no admin_users table or
-- role/identity model anywhere in this schema yet (same gap already noted in
-- 20260902100000_visa_rejection_reason_and_case_notifications.sql) — add an
-- admin select policy once that identity model exists. No patient policy
-- either, by design: unlike visa_document_requests (patient-visible by
-- default), these notes are confidential, so RLS grants no patient access.

create table public.visa_case_notes (
  id         uuid        primary key default gen_random_uuid(),
  case_id    uuid        not null references public.cases (id) on delete cascade,
  lawyer_id  uuid        not null references public.lawyers (id),
  body       text        not null,
  created_at timestamptz not null default now()
);

create index on public.visa_case_notes (case_id, created_at);

alter table public.visa_case_notes enable row level security;

create policy "Lawyers can view notes on their assigned cases"
  on public.visa_case_notes for select
  to authenticated
  using (public.lawyer_has_access_to_case(case_id));

-- Same shape as "Lawyers can create requests on their assigned cases"
-- (20260826030000) — lawyer_id is pinned to the caller's own lawyer row via
-- with check, not client-supplied, so a bare RLS insert is safe here without
-- needing a SECURITY DEFINER RPC.
create policy "Lawyers can create notes on their assigned cases"
  on public.visa_case_notes for insert
  to authenticated
  with check (
    lawyer_id = (select id from public.lawyers where user_id = auth.uid())
    and public.lawyer_has_access_to_case(case_id)
  );

-- lawyer_notes was never written and its only reader was the patient-facing
-- visa detail page — remove the column along with that dead rendering.
alter table public.visa_submissions drop column lawyer_notes;
