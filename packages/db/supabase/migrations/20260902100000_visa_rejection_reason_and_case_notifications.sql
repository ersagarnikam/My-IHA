-- Visa Lawyer Portal: capture a rejection reason on visa_submissions, sync
-- cases.status when a visa is rejected (the sync trigger added in
-- 20260604000001 only ever handled 'processing'/'approved' — 'rejected' fell
-- through and left cases.status stale), and notify the case's patient,
-- assigned hospital, and assigned doctor when a lawyer approves or rejects a
-- visa. Admin is intentionally not notified here — there's no admin_users
-- table or role/identity model anywhere in the schema yet (apps/admin has no
-- case-list feature either), so there's no user_id to attach a notification
-- to. Same "left for later" treatment as the other Admin-gated types called
-- out in 20260805000000_add_hospital_doctor_notification_triggers.sql.

alter table public.visa_submissions
  add column rejection_reason text;

-- New terminal case status for a rejected visa. Cases.status previously had
-- no way to represent this at all. Full list carried forward from
-- 20260603000009_simplify_visa_flow.sql (which added visa_documents_submitted
-- on top of the original 20260602000001 list) plus visa_rejected.
alter table public.cases
  drop constraint cases_status_check;

alter table public.cases
  add constraint cases_status_check check (status in (
    'case_submitted', 'under_review', 'doctor_assigned', 'evaluation',
    'treatment_plan', 'treatment_confirmed', 'payment_confirmed',
    'visa_documents_submitted', 'visa_processing', 'travel_ready',
    'visa_rejected', 'completed', 'closed'
  ));

-- ─────────────────────────────────────────────────────────
-- update_visa_submission_status: now takes an optional rejection reason,
-- required (non-blank) when transitioning to 'rejected'. Same
-- security-definer + lawyer_has_access_to_case gate as before. The added
-- parameter changes the function's signature, so `create or replace` would
-- add a second overload rather than replace the original — drop the old
-- 2-arg version explicitly first.
-- ─────────────────────────────────────────────────────────
drop function if exists public.update_visa_submission_status(uuid, text);

create or replace function public.update_visa_submission_status(
  p_case_id           uuid,
  p_status            text,
  p_rejection_reason  text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lawyer_id uuid;
  v_current   text;
begin
  select id into v_lawyer_id from public.lawyers where user_id = auth.uid();
  if v_lawyer_id is null or not public.lawyer_has_access_to_case(p_case_id) then
    raise exception 'unauthorized';
  end if;

  select status into v_current from public.visa_submissions where case_id = p_case_id for update;
  if v_current is null then
    raise exception 'not_found';
  end if;

  if not (
    (v_current = 'documents_submitted' and p_status = 'under_review') or
    (v_current = 'under_review' and p_status = 'processing') or
    (v_current = 'additional_docs_requested' and p_status in ('under_review', 'processing')) or
    (v_current = 'application_submitted' and p_status in ('processing', 'approved', 'rejected')) or
    (v_current = 'processing' and p_status in ('approved', 'rejected'))
  ) then
    raise exception 'invalid_transition';
  end if;

  if p_status = 'rejected' and coalesce(trim(p_rejection_reason), '') = '' then
    raise exception 'rejection_reason_required';
  end if;

  update public.visa_submissions
  set status = p_status,
      rejection_reason = case when p_status = 'rejected' then trim(p_rejection_reason) else rejection_reason end
  where case_id = p_case_id;
end;
$$;

revoke execute on function public.update_visa_submission_status(uuid, text, text) from public;
grant execute on function public.update_visa_submission_status(uuid, text, text) to authenticated;

-- ─────────────────────────────────────────────────────────
-- Trigger: sync cases.status on rejection too (approved/processing already
-- handled). visa_rejected is terminal, mirroring how 'closed' is treated
-- elsewhere (excluded from the patient/hospital/doctor "in progress" status
-- lists — a rejected visa isn't something those flows keep advancing).
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.sync_case_status_from_visa()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'processing' AND OLD.status IS DISTINCT FROM 'processing' THEN
    UPDATE public.cases
    SET status = 'visa_processing', updated_at = now()
    WHERE id = NEW.case_id;

  ELSIF NEW.status = 'approved' AND OLD.status IS DISTINCT FROM 'approved' THEN
    UPDATE public.cases
    SET status = 'travel_ready', updated_at = now()
    WHERE id = NEW.case_id;

  ELSIF NEW.status = 'rejected' AND OLD.status IS DISTINCT FROM 'rejected' THEN
    UPDATE public.cases
    SET status = 'visa_rejected', updated_at = now()
    WHERE id = NEW.case_id;
  END IF;

  RETURN NEW;
END;
$$;

-- ─────────────────────────────────────────────────────────
-- get_case_provider_user_ids: resolves the auth user_id of the hospital and
-- doctor tied to a case's (non-draft) treatment plan, for the lawyer portal
-- to notify them on visa approval/rejection. Security-definer because
-- lawyers have no direct RLS access to treatment_plans (only the owning
-- doctor and named hospital do, see 20260722000000/20260731050000) — same
-- shape as lawyer_has_access_to_case.
-- ─────────────────────────────────────────────────────────
create or replace function public.get_case_provider_user_ids(p_case_id uuid)
returns table(hospital_user_id uuid, doctor_user_id uuid)
language plpgsql
security definer
set search_path = public
as $$
begin
  if not public.lawyer_has_access_to_case(p_case_id) then
    raise exception 'unauthorized';
  end if;

  return query
    select h.user_id, d.user_id
    from public.treatment_plans tp
    left join public.hospitals h on h.id = tp.hospital_id
    left join public.doctors d on d.id = tp.doctor_id
    where tp.case_id = p_case_id
    order by tp.created_at desc
    limit 1;
end;
$$;

revoke execute on function public.get_case_provider_user_ids(uuid) from public;
grant execute on function public.get_case_provider_user_ids(uuid) to authenticated;

-- ─────────────────────────────────────────────────────────
-- notify_case_status_change (20260624000003) fires on every cases.status
-- change, including this one now that visa_rejected exists — without a
-- branch for it, it would fall through to the generic "status has been
-- updated to visa_rejected" copy. Add a proper branch, matching the quality
-- of the existing per-status copy (e.g. travel_ready's approval message).
-- ─────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.notify_case_status_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
declare
  v_user_id uuid;
  v_type    text;
  v_title   text;
  v_message text;
begin
  if NEW.status is distinct from OLD.status then
    select user_id into v_user_id from public.patients where id = NEW.patient_id;
    if v_user_id is null then
      return NEW;
    end if;

    v_type := case when NEW.status = 'payment_confirmed' then 'payment_confirmed' else 'case_status_updated' end;

    case NEW.status
      when 'case_submitted' then
        v_title := 'Case submitted';
        v_message := 'Your case ' || NEW.reference_number || ' has been submitted and is awaiting review.';
      when 'under_review' then
        v_title := 'Case under review';
        v_message := 'Your case ' || NEW.reference_number || ' is now under review by our specialists.';
      when 'doctor_assigned' then
        v_title := 'Doctor assigned';
        v_message := 'A doctor has been assigned to your case ' || NEW.reference_number || '.';
      when 'evaluation' then
        v_title := 'Case in evaluation';
        v_message := 'Your case ' || NEW.reference_number || ' is being evaluated by your doctor.';
      when 'treatment_plan' then
        v_title := 'Treatment plan ready';
        v_message := 'A treatment plan is ready for your case ' || NEW.reference_number || '.';
      when 'treatment_confirmed' then
        v_title := 'Treatment confirmed';
        v_message := 'Your treatment plan for case ' || NEW.reference_number || ' has been confirmed.';
      when 'payment_confirmed' then
        v_title := 'Payment confirmed';
        v_message := 'Your payment for case ' || NEW.reference_number || ' has been confirmed. Visa processing will begin shortly.';
      when 'visa_processing' then
        v_title := 'Visa processing started';
        v_message := 'Visa processing has started for your case ' || NEW.reference_number || '.';
      when 'travel_ready' then
        v_title := 'Travel ready';
        v_message := 'Your visa has been approved. Your case ' || NEW.reference_number || ' is ready for travel.';
      when 'visa_rejected' then
        v_title := 'Visa application rejected';
        v_message := 'Your visa application for case ' || NEW.reference_number || ' was not approved. See your visa application for the reason given.';
      when 'completed' then
        v_title := 'Case completed';
        v_message := 'Your case ' || NEW.reference_number || ' has been marked as completed.';
      when 'closed' then
        v_title := 'Case closed';
        v_message := 'Your case ' || NEW.reference_number || ' has been closed.';
      else
        v_title := 'Case status updated';
        v_message := 'Your case ' || NEW.reference_number || ' status has been updated to ' || NEW.status || '.';
    end case;

    insert into public.notifications (user_id, type, title, message, case_id)
    values (v_user_id, v_type, v_title, v_message, NEW.id);
  end if;

  return NEW;
end;
$$;
