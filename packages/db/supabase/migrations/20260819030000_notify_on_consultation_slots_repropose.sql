-- notify_consultation_status_change() only inserted a notification when
-- NEW.status is distinct from OLD.status. propose_consultation_slots() lets
-- a doctor re-propose times while the request is already 'slots_proposed'
-- (deletes+reinserts consultation_slots, then sets status = 'slots_proposed'
-- again) — status doesn't change, so the patient never got notified that
-- the times were updated. Add a branch that detects this same-status
-- repropose via updated_at and sends a "times updated" notification.
-- Based on the current function body from
-- 20260811010000_add_case_and_doctor_to_consultation_notifications.sql.
create or replace function public.notify_consultation_status_change()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_user_id     uuid;
  v_doctor_name text;
  v_case_number text;
  v_doctor_ref   text;
  v_doctor_start text;
  v_title        text;
  v_message      text;
begin
  if NEW.status is distinct from OLD.status or
     (NEW.status = 'slots_proposed' and NEW.updated_at is distinct from OLD.updated_at)
  then
    select user_id into v_user_id from public.patients where id = NEW.patient_id;
    if v_user_id is null then
      return NEW;
    end if;

    select d.full_name into v_doctor_name
    from public.treatment_options t
    join public.treatment_plans tp on tp.id = t.treatment_plan_id
    left join public.doctors d on d.id = tp.doctor_id
    where t.id = NEW.treatment_option_id;

    select reference_number into v_case_number from public.cases where id = NEW.case_id;

    v_case_number := coalesce(v_case_number, 'your case');
    v_doctor_ref := case when v_doctor_name is not null then 'Dr. ' || v_doctor_name else 'your doctor' end;
    v_doctor_start := case when v_doctor_name is not null then 'Dr. ' || v_doctor_name else 'Your doctor' end;

    if NEW.status is distinct from OLD.status then
      case NEW.status
        when 'slots_proposed' then
          v_title := 'Consultation slots proposed';
          v_message := v_doctor_start || ' has proposed consultation times for case ' || v_case_number || '. Please select a slot.';
        when 'slot_selected' then
          v_title := 'Consultation slot selected';
          v_message := 'You selected a consultation slot for case ' || v_case_number || ' with ' || v_doctor_ref || '. Awaiting confirmation.';
        when 'scheduled' then
          v_title := 'Consultation scheduled';
          v_message := 'Your consultation for case ' || v_case_number || ' with ' || v_doctor_ref || ' has been scheduled.';
        when 'cancelled' then
          v_title := 'Consultation cancelled';
          v_message := 'Your consultation request for case ' || v_case_number || ' with ' || v_doctor_ref || ' has been cancelled.' ||
            case when NEW.cancellation_reason is not null then ' Reason: ' || NEW.cancellation_reason else '' end;
        else
          v_title := 'Consultation status updated';
          v_message := 'Your consultation request status has been updated to ' || NEW.status || '.';
      end case;
    else
      v_title := 'Consultation times updated';
      v_message := v_doctor_start || ' has updated the proposed consultation times for case ' || v_case_number || '. Please select a slot.';
    end if;

    insert into public.notifications (user_id, type, title, message, case_id)
    values (v_user_id, 'consultation_status_updated', v_title, v_message, NEW.case_id);
  end if;

  return NEW;
end;
$$;
