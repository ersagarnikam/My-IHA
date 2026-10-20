-- A hospital can have two of its own doctors assigned to the same case in
-- parallel (see doctor_case_assignments_case_doctor_key: unique per
-- doctor+case, not per hospital+case). Its case-management notifications
-- (treatment_plan_patient_confirmed, case_closed_*, hospital_selected_by_doctor)
-- were only ever case-scoped (case_id), so a hospital receiving one
-- notification about "Doctor A confirmed" and another about "Doctor B's
-- case closed" for the same case had no way to route each notification to
-- the right assignment row -- both clicks landed on
-- /case-management/{caseId}, which (fetchAssignmentForHospitalCase) always
-- resolves to the single 'patient_confirmed' assignment when one exists,
-- so the "Case closed" notification wrongly opened the winning doctor's
-- Treatment Confirmed case instead of the losing one.
--
-- Adds a nullable assignment_id to notifications and populates it on every
-- hospital-facing (and, for consistency, doctor-facing) insert in the
-- three functions that can produce more than one live notification for the
-- same case_id: notify_hospital_on_treatment_plan_submission,
-- close_out_doctors_on_plan_presented, notify_on_treatment_plan_patient_confirmed.
-- Doctor-facing notifications don't strictly need it (a doctor has at most
-- one assignment per case), but populating it there too costs nothing and
-- keeps the column meaning consistent.

alter table public.notifications
  add column assignment_id uuid references public.doctor_case_assignments (id) on delete set null;

create index on public.notifications (assignment_id);

create or replace function public.notify_hospital_on_treatment_plan_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital_user_id uuid;
  v_doctor_name       text;
  v_case_number       text;
  v_assignment_id      uuid;
begin
  if NEW.status = 'submitted_to_iha' and OLD.status is distinct from NEW.status then
    select user_id into v_hospital_user_id from public.hospitals where id = NEW.hospital_id;
    if v_hospital_user_id is null then
      return NEW;
    end if;

    select full_name into v_doctor_name from public.doctors where id = NEW.doctor_id;
    select reference_number into v_case_number from public.cases where id = NEW.case_id;
    select id into v_assignment_id from public.doctor_case_assignments
      where case_id = NEW.case_id and doctor_id = NEW.doctor_id;

    insert into public.notifications (user_id, type, title, message, case_id, assignment_id)
    values (
      v_hospital_user_id,
      'hospital_selected_by_doctor',
      'New treatment plan for your hospital',
      coalesce(v_doctor_name, 'A doctor') || ' submitted a treatment plan naming your hospital for ' ||
        coalesce(public.decrypt_pii(NEW.procedure_name_enc), 'a case') ||
        ' (Case ' || coalesce(v_case_number, 'N/A') || ').',
      NEW.case_id,
      v_assignment_id
    );
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
  v_case_number    text;
  v_row            record;
  v_doctor_message text;
begin
  if NEW.status = 'presented_to_patient' and OLD.status is distinct from NEW.status then
    v_procedure_name := coalesce(public.decrypt_pii(NEW.procedure_name_enc), 'a case');
    select reference_number into v_case_number from public.cases where id = NEW.case_id;

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
          'Your treatment plan for case ' || coalesce(v_case_number, 'N/A') ||
          ' was not selected to be presented to the patient. This case is now closed on your end.';
      else
        v_doctor_message :=
          'The patient has been presented with a treatment plan from another doctor for ' ||
          v_procedure_name || ' (Case ' || coalesce(v_case_number, 'N/A') || '). This case is now closed on your end.';
      end if;

      if v_row.doctor_user_id is not null then
        insert into public.notifications (user_id, type, title, message, case_id, assignment_id)
        values (v_row.doctor_user_id, 'case_closed_plan_not_presented', 'Case closed', v_doctor_message, NEW.case_id, v_row.assignment_id);
      end if;

      if v_row.hospital_user_id is not null then
        insert into public.notifications (user_id, type, title, message, case_id, assignment_id)
        values (
          v_row.hospital_user_id,
          'case_closed_plan_not_presented',
          'Case closed',
          'A treatment plan for case ' || coalesce(v_case_number, 'N/A') ||
            ' has been presented to the patient by another doctor. This case is now closed for your affiliated doctor.',
          NEW.case_id,
          v_row.assignment_id
        );
      end if;
    end loop;
  end if;

  return NEW;
end;
$$;

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
  v_case_number      text;
  v_assignment_id     uuid;
  v_row              record;
begin
  if NEW.status = 'patient_confirmed' and OLD.status is distinct from NEW.status then
    v_procedure_name := coalesce(public.decrypt_pii(NEW.procedure_name_enc), 'a case');
    select reference_number into v_case_number from public.cases where id = NEW.case_id;

    update public.doctor_case_assignments
    set status = 'accepted'
    where case_id = NEW.case_id and doctor_id = NEW.doctor_id and status = 'cancelled';

    select id into v_assignment_id from public.doctor_case_assignments
      where case_id = NEW.case_id and doctor_id = NEW.doctor_id;

    select user_id into v_doctor_user_id from public.doctors where id = NEW.doctor_id;
    if v_doctor_user_id is not null then
      insert into public.notifications (user_id, type, title, message, case_id, assignment_id)
      values (
        v_doctor_user_id,
        'treatment_plan_patient_confirmed',
        'Patient confirmed and paid',
        'The patient has confirmed and paid for the treatment plan for ' || v_procedure_name ||
          ' (Case ' || coalesce(v_case_number, 'N/A') || ').',
        NEW.case_id,
        v_assignment_id
      );
    end if;

    select user_id into v_hospital_user_id from public.hospitals where id = NEW.hospital_id;
    if v_hospital_user_id is not null then
      insert into public.notifications (user_id, type, title, message, case_id, assignment_id)
      values (
        v_hospital_user_id,
        'treatment_plan_patient_confirmed',
        'Patient confirmed and paid',
        'The patient has confirmed and paid for ' || v_procedure_name ||
          ' (Case ' || coalesce(v_case_number, 'N/A') ||
          '). Please upload the hospital invitation and appointment confirmation letters for this case.',
        NEW.case_id,
        v_assignment_id
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
        insert into public.notifications (user_id, type, title, message, case_id, assignment_id)
        values (
          v_row.doctor_user_id,
          'case_closed_other_doctor_selected',
          'Case closed',
          'The patient has confirmed and paid for another doctor''s treatment plan for ' ||
            v_procedure_name || ' (Case ' || coalesce(v_case_number, 'N/A') || '). This case is now closed on your end.',
          NEW.case_id,
          v_row.assignment_id
        );
      end if;

      if v_row.hospital_user_id is not null then
        insert into public.notifications (user_id, type, title, message, case_id, assignment_id)
        values (
          v_row.hospital_user_id,
          'case_closed_other_doctor_selected',
          'Case closed',
          'The patient has confirmed and paid for another doctor''s treatment plan for ' ||
            v_procedure_name || ' (Case ' || coalesce(v_case_number, 'N/A') || '). This case is now closed for your affiliated doctor.',
          NEW.case_id,
          v_row.assignment_id
        );
      end if;
    end loop;
  end if;

  return NEW;
end;
$$;
