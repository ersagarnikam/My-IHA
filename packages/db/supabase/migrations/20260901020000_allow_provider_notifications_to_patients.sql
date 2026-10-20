-- notifications only ever had "Users can insert own notifications" (user_id =
-- auth.uid()), which is correct for the patient app's self-notifications but
-- silently blocks every provider->patient notification written via the
-- shared app-layer insertNotification() helper (packages/db/src/cases.ts) —
-- it runs with the request-scoped (RLS-respecting) client, not a
-- service-role one. This already affected apps/visa's requestDocumentAction
-- and apps/hospital's visa-documents.ts notify-on-letter-sent flow (both
-- fail silently: the DB write they gate on succeeds, only the notification
-- insert is dropped and logged) — surfaced now by apps/visa's new
-- updateVisaStatusAction (20260901010000).
--
-- Fix: a narrow insert policy for providers who already have verified
-- access to the case (via the existing lawyer_has_access_to_case /
-- hospital_has_access_to_case security-definer functions), restricted to
-- notifying *that case's own patient* — not an arbitrary user_id.
create or replace function public.case_patient_user_id(target_case_id uuid)
returns uuid
language sql
security definer
set search_path = public
stable
as $$
  select p.user_id
  from public.cases c
  join public.patients p on p.id = c.patient_id
  where c.id = target_case_id;
$$;

create policy "Providers can notify the patient on cases they have access to"
  on public.notifications for insert
  to authenticated
  with check (
    case_id is not null
    and user_id = public.case_patient_user_id(case_id)
    and (
      public.lawyer_has_access_to_case(case_id)
      or public.hospital_has_access_to_case(case_id)
    )
  );
