-- Insert an in-portal notification whenever consultation_requests.status
-- changes, no matter how the change was made (app code, an RPC, or a manual
-- edit/seed in the Supabase dashboard). Mirrors notify_case_status_change()
-- from 20260624000003: this trigger only ever inserts the in-portal row —
-- it never sends email/SMS. There is no hospital-side app code yet that
-- drives these status changes, so there's nothing to wire an email/SMS
-- dispatch call into; once that exists, it can call an analogous
-- dispatchConsultationStatusAlerts() after the status update, the same way
-- dispatchCaseStatusAlerts() is used for case status changes.
create or replace function public.notify_consultation_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id   uuid;
  v_procedure text;
  v_title     text;
  v_message   text;
begin
  if NEW.status is distinct from OLD.status then
    select user_id into v_user_id from public.patients where id = NEW.patient_id;
    if v_user_id is null then
      return NEW;
    end if;

    select coalesce(procedure_name, treatment_summary) into v_procedure
    from public.treatment_options
    where id = NEW.treatment_option_id;

    case NEW.status
      when 'slots_proposed' then
        v_title := 'Consultation slots proposed';
        v_message := 'Your doctor has proposed consultation times for ' || coalesce(v_procedure, 'your treatment plan') || '. Please select a slot.';
      when 'slot_selected' then
        v_title := 'Consultation slot selected';
        v_message := 'You selected a consultation slot for ' || coalesce(v_procedure, 'your treatment plan') || '. Awaiting confirmation.';
      when 'scheduled' then
        v_title := 'Consultation scheduled';
        v_message := 'Your consultation for ' || coalesce(v_procedure, 'your treatment plan') || ' has been scheduled.';
      when 'cancelled' then
        v_title := 'Consultation cancelled';
        v_message := 'Your consultation request for ' || coalesce(v_procedure, 'your treatment plan') || ' has been cancelled.';
      else
        v_title := 'Consultation status updated';
        v_message := 'Your consultation request status has been updated to ' || NEW.status || '.';
    end case;

    insert into public.notifications (user_id, type, title, message, case_id)
    values (v_user_id, 'consultation_status_updated', v_title, v_message, NEW.case_id);
  end if;

  return NEW;
end;
$$;

drop trigger if exists consultation_requests_notify_status_change on public.consultation_requests;

create trigger consultation_requests_notify_status_change
  after update of status on public.consultation_requests
  for each row
  execute function public.notify_consultation_status_change();
