-- Neither close-out trigger (20260824090712) ever reactivates the doctor
-- named in NEW -- they only ever cancel *other* doctors on the case. So if
-- doctor A's plan is routed to the patient first (correctly closing out
-- doctor B, whose own plan wasn't presented yet), and B's plan later reaches
-- presented_to_patient/patient_confirmed on its own, nothing undoes B's
-- earlier 'cancelled' assignment -- the doctor portal keeps showing their
-- own winning case as "Case Closed".
--
-- Observed live: case MTA-2026-00049, doctor Jasmeen. Doctor Priya's plan
-- was routed to presented_to_patient first, closing out Jasmeen (whose plan
-- wasn't presented yet at that point) as designed. Jasmeen's plan later
-- became the one presented_to_patient/patient_confirmed, but her
-- doctor_case_assignments row stayed 'cancelled' from Priya's earlier event.

-- One-time repair: any doctor already sitting at 'cancelled' whose own plan
-- has since reached presented_to_patient or patient_confirmed was
-- incorrectly left closed out.
update public.doctor_case_assignments dca
set status = 'accepted'
from public.treatment_plans tp
where tp.case_id = dca.case_id
  and tp.doctor_id = dca.doctor_id
  and dca.status = 'cancelled'
  and tp.status in ('presented_to_patient', 'patient_confirmed');

-- Going forward: whenever a doctor's own plan reaches presented_to_patient,
-- reactivate their assignment first in case an earlier close-out (for a
-- different doctor on the same case) left it 'cancelled'.
create or replace function public.close_out_doctors_on_plan_presented()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_procedure_name text;
  v_row            record;
  v_doctor_message text;
begin
  if NEW.status = 'presented_to_patient' and OLD.status is distinct from NEW.status then
    v_procedure_name := coalesce(public.decrypt_pii(NEW.procedure_name_enc), 'a case');

    update public.doctor_case_assignments
    set status = 'accepted'
    where case_id = NEW.case_id and doctor_id = NEW.doctor_id and status = 'cancelled';

    for v_row in
      select dca.id as assignment_id, dca.doctor_id,
             tp.id as plan_id, tp.status as plan_status,
             d.user_id as doctor_user_id, h.user_id as hospital_user_id
      from public.doctor_case_assignments dca
      join public.doctors d on d.id = dca.doctor_id
      left join public.treatment_plans tp
        on tp.case_id = dca.case_id and tp.doctor_id = dca.doctor_id
      left join public.hospitals h
        on h.id = coalesce(
             tp.hospital_id,
             (select dha.hospital_id
              from public.doctor_hospital_affiliations dha
              where dha.doctor_id = d.id
              order by dha.created_at
              limit 1)
           )
      where dca.case_id = NEW.case_id
        and dca.doctor_id != NEW.doctor_id
        and dca.status in ('invited', 'accepted')
        and (
          tp.status is null
          or tp.status not in ('presented_to_patient', 'patient_confirmed', 'rejected_by_iha', 'not_selected')
        )
    loop
      update public.doctor_case_assignments
      set status = 'cancelled'
      where id = v_row.assignment_id;

      if v_row.plan_id is not null and v_row.plan_status != 'draft' then
        update public.treatment_plans
        set status = 'rejected_by_iha', updated_at = now()
        where id = v_row.plan_id;

        v_doctor_message :=
          'Your treatment plan for this case was not selected to be presented to the patient. ' ||
          'This case is now closed on your end.';
      else
        v_doctor_message :=
          'The patient has been presented with a treatment plan from another doctor for ' ||
          v_procedure_name || '. This case is now closed on your end.';
      end if;

      if v_row.doctor_user_id is not null then
        insert into public.notifications (user_id, type, title, message, case_id)
        values (v_row.doctor_user_id, 'case_closed_plan_not_presented', 'Case closed', v_doctor_message, NEW.case_id);
      end if;

      if v_row.hospital_user_id is not null then
        insert into public.notifications (user_id, type, title, message, case_id)
        values (
          v_row.hospital_user_id,
          'case_closed_plan_not_presented',
          'Case closed',
          'A treatment plan for this case has been presented to the patient by another doctor. ' ||
            'This case is now closed for your affiliated doctor.',
          NEW.case_id
        );
      end if;
    end loop;
  end if;

  return NEW;
end;
$$;

-- Same reactivation, and same reasoning, for the payment-confirmation trigger.
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

    update public.doctor_case_assignments
    set status = 'accepted'
    where case_id = NEW.case_id and doctor_id = NEW.doctor_id and status = 'cancelled';

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
    -- responded) is now moot -- close them out and tell them, and their
    -- hospital.
    for v_row in
      select dca.id as assignment_id, dca.doctor_id,
             d.user_id as doctor_user_id, h.user_id as hospital_user_id
      from public.doctor_case_assignments dca
      join public.doctors d on d.id = dca.doctor_id
      left join public.treatment_plans tp
        on tp.case_id = dca.case_id and tp.doctor_id = dca.doctor_id
      left join public.hospitals h
        on h.id = coalesce(
             tp.hospital_id,
             (select dha.hospital_id
              from public.doctor_hospital_affiliations dha
              where dha.doctor_id = d.id
              order by dha.created_at
              limit 1)
           )
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
