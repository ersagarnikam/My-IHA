-- notify_case_status_change() had no branch for 'visa_documents_submitted',
-- so that transition fell through to the generic 'Case status updated'
-- title. The patient portal's CaseTimeline card matches notifications back
-- to a status via their exact title text (TITLE_TO_STATUS in
-- apps/patient/components/cases/case-timeline.tsx) and drops anything that
-- doesn't match, so visa document submission never appeared in the Timeline
-- card even though the separate status stepper (which reads cases.status
-- directly) updated correctly.
create or replace function public.notify_case_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
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
      when 'visa_documents_submitted' then
        v_title := 'Visa documents submitted';
        v_message := 'Your visa application for case ' || NEW.reference_number || ' has been submitted to MTA.';
      when 'visa_processing' then
        v_title := 'Visa processing started';
        v_message := 'Visa processing has started for your case ' || NEW.reference_number || '.';
      when 'travel_ready' then
        v_title := 'Travel ready';
        v_message := 'Your visa has been approved. Your case ' || NEW.reference_number || ' is ready for travel.';
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
