-- Second close-out point, earlier than payment (20260821010000): the moment
-- MTA Admin routes a treatment plan to the patient (treatment_plans.status ->
-- 'presented_to_patient' — reserved since 20260722000000 but has no writer
-- yet, same "not built" gap as the rest of the Admin review flow). At that
-- point, any other doctor on the case who structurally can't be part of what
-- was just sent is done:
--   - never responded (still `invited`), or
--   - accepted but never submitted a plan (no treatment_plans row, or still
--     `draft`)
-- gets their assignment closed with no plan-status change (nothing to
-- reject — they never submitted).
--   - submitted a plan that Admin chose not to route this round gets that
--     plan marked `rejected_by_iha` (Admin explicitly passed on it) as well
--     as their assignment closed.
-- A doctor whose own plan is ALSO presented_to_patient (Admin can route more
-- than one plan for the same case) is left untouched — they're still
-- legitimately competing until the patient pays (20260821010000).

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
      left join public.hospitals h on h.id = d.hospital_id
      left join public.treatment_plans tp
        on tp.case_id = dca.case_id and tp.doctor_id = dca.doctor_id
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

drop trigger if exists treatment_plans_notify_presented_to_patient on public.treatment_plans;

create trigger treatment_plans_notify_presented_to_patient
  after update of status on public.treatment_plans
  for each row
  execute function public.close_out_doctors_on_plan_presented();
