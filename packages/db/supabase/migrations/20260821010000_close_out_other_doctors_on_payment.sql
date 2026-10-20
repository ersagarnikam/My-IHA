-- Multiple doctors can be invited/accepted onto the same case, each with
-- their own treatment_plans row (20260722000000). Once the patient pays for
-- one doctor's plan, every other doctor on the case — whether they submitted
-- a plan that wasn't picked, or never responded to the invite at all — was
-- previously left untouched: same status forever, no notification, and (per
-- the doctor-portal badge logic in case-row-status-badge.tsx) an `invited`
-- doctor kept reading the case as "New" indefinitely. This adds an explicit
-- terminal state for both tables and closes those doctors out at the same
-- point notify_on_treatment_plan_patient_confirmed already fires.

alter table public.doctor_case_assignments
  drop constraint doctor_case_assignments_status_check,
  add constraint doctor_case_assignments_status_check
    check (status in ('invited', 'accepted', 'declined', 'withdrawn', 'cancelled'));

alter table public.treatment_plans
  drop constraint treatment_plans_status_check,
  add constraint treatment_plans_status_check check (status in (
    'draft', 'submitted_to_iha', 'iha_review_in_progress', 'iha_approved',
    'rejected_by_iha', 'presented_to_patient', 'patient_confirmed', 'not_selected'
  ));

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
  v_row              record;
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

    -- Every other doctor still active on this case (a losing plan, or never
    -- responded) is now moot — close them out and tell them, and their
    -- hospital. doctors.hospital_id is a direct not-null FK, so this covers
    -- doctors who never got as far as filing a treatment_plans row.
    for v_row in
      select dca.id as assignment_id, dca.doctor_id,
             d.user_id as doctor_user_id, h.user_id as hospital_user_id
      from public.doctor_case_assignments dca
      join public.doctors d on d.id = dca.doctor_id
      left join public.hospitals h on h.id = d.hospital_id
      where dca.case_id = NEW.case_id
        and dca.doctor_id != NEW.doctor_id
        and dca.status in ('invited', 'accepted')
    loop
      update public.doctor_case_assignments
      set status = 'cancelled'
      where id = v_row.assignment_id;

      update public.treatment_plans
      set status = 'not_selected', updated_at = now()
      where case_id = NEW.case_id
        and doctor_id = v_row.doctor_id
        and status not in ('not_selected', 'rejected_by_iha', 'patient_confirmed');

      if v_row.doctor_user_id is not null then
        insert into public.notifications (user_id, type, title, message, case_id)
        values (
          v_row.doctor_user_id,
          'case_closed_other_doctor_selected',
          'Case closed',
          'The patient has confirmed and paid for another doctor''s treatment plan for ' ||
            v_procedure_name || '. This case is now closed on your end.',
          NEW.case_id
        );
      end if;

      if v_row.hospital_user_id is not null then
        insert into public.notifications (user_id, type, title, message, case_id)
        values (
          v_row.hospital_user_id,
          'case_closed_other_doctor_selected',
          'Case closed',
          'The patient has confirmed and paid for another doctor''s treatment plan for ' ||
            v_procedure_name || '. This case is now closed for your affiliated doctor.',
          NEW.case_id
        );
      end if;
    end loop;
  end if;

  return NEW;
end;
$$;
