-- Both close-out triggers (20260821010000, 20260821020000) join
-- `public.doctors d ... left join public.hospitals h on h.id = d.hospital_id`,
-- but doctors.hospital_id was dropped in 20260714112707 in favor of the
-- doctor_hospital_affiliations join table (a doctor can now affiliate with
-- 0+ hospitals) -- breaking both functions with "column d.hospital_id does
-- not exist" as soon as either trigger fires. Re-point both at
-- treatment_plans.hospital_id first (the hospital the doctor actually
-- submitted their plan against, if any -- unique per case_id/doctor_id, so
-- no fan-out), falling back to the doctor's oldest affiliation for doctors
-- who never submitted a plan at all.
--
-- Also: the live database's check constraints were found to be missing the
-- 'cancelled' (doctor_case_assignments) and 'not_selected' (treatment_plans)
-- values that 20260821010000 was supposed to have added alongside these
-- functions -- schema drift between that migration and what actually ran on
-- the linked project. Both functions write those values, so re-apply the
-- constraint widening here (idempotent: drops only if present).

alter table public.doctor_case_assignments
  drop constraint if exists doctor_case_assignments_status_check,
  add constraint doctor_case_assignments_status_check
    check (status in ('invited', 'accepted', 'declined', 'withdrawn', 'cancelled'));

alter table public.treatment_plans
  drop constraint if exists treatment_plans_status_check,
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
    -- responded) is now moot -- close them out and tell them, and their
    -- hospital. doctors.hospital_id was dropped in 20260714112707; use the
    -- doctor's own treatment_plans.hospital_id when they submitted a plan,
    -- else fall back to their oldest doctor_hospital_affiliations row.
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
