-- Doctor and hospital notification for the one treatment_plans.status
-- transition into 'patient_confirmed' that app code will actually cause
-- (apps/patient/app/api/payments/webhook/route.ts, on payment_intent.succeeded
-- for the case's full treatment payment). The other post-submission statuses
-- (iha_review_in_progress, iha_approved, rejected_by_iha, presented_to_patient)
-- have no code path that sets them yet — that's the unbuilt MTA Admin review
-- flow — so there's nothing to hang a trigger off for those until that
-- exists. Mirrors notify_hospital_on_treatment_plan_submission's shape
-- (20260805000000_add_hospital_doctor_notification_triggers.sql).
create or replace function public.notify_on_treatment_plan_patient_confirmed()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doctor_user_id   uuid;
  v_hospital_user_id uuid;
  v_procedure_name   text;
begin
  if NEW.status = 'patient_confirmed' and OLD.status is distinct from NEW.status then
    v_procedure_name := coalesce(public.decrypt_pii(NEW.procedure_name_enc), 'a case');

    select user_id into v_doctor_user_id from public.doctors where id = NEW.doctor_id;
    if v_doctor_user_id is not null then
      insert into public.notifications (user_id, type, title, message, case_id)
      values (
        v_doctor_user_id,
        'treatment_plan_patient_confirmed',
        'Patient confirmed and paid',
        'The patient has confirmed and paid for the treatment plan for ' || v_procedure_name || '.',
        NEW.case_id
      );
    end if;

    select user_id into v_hospital_user_id from public.hospitals where id = NEW.hospital_id;
    if v_hospital_user_id is not null then
      insert into public.notifications (user_id, type, title, message, case_id)
      values (
        v_hospital_user_id,
        'treatment_plan_patient_confirmed',
        'Patient confirmed and paid',
        'The patient has confirmed and paid for ' || v_procedure_name ||
          '. Please upload the hospital invitation and appointment confirmation letters for this case.',
        NEW.case_id
      );
    end if;
  end if;

  return NEW;
end;
$$;

drop trigger if exists treatment_plans_notify_patient_confirmed on public.treatment_plans;

create trigger treatment_plans_notify_patient_confirmed
  after update of status on public.treatment_plans
  for each row
  execute function public.notify_on_treatment_plan_patient_confirmed();
