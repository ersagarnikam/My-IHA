-- Fix notify_hospital_on_treatment_plan_submission() (20260805000000): it
-- reads NEW.procedure_name, but that column was renamed to
-- procedure_name_enc (bytea) by 20260724150000_encrypt_treatment_plan_data —
-- procedure_name now only exists as a computed decrypt function, not a real
-- row field, so `NEW.procedure_name` raised "record \"new\" has no field
-- \"procedure_name\"" and aborted the whole submit_treatment_plan()
-- transaction. Only hit when the plan's hospital has a linked portal
-- account (the earlier null-check above it returns before this line
-- otherwise), which is why it passed doctor testing against unlinked
-- hospitals but failed reliably against a linked one.
create or replace function public.notify_hospital_on_treatment_plan_submission()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_hospital_user_id uuid;
  v_doctor_name       text;
begin
  if NEW.status = 'submitted_to_iha' and OLD.status is distinct from NEW.status then
    select user_id into v_hospital_user_id from public.hospitals where id = NEW.hospital_id;
    if v_hospital_user_id is null then
      return NEW;
    end if;

    select full_name into v_doctor_name from public.doctors where id = NEW.doctor_id;

    insert into public.notifications (user_id, type, title, message, case_id)
    values (
      v_hospital_user_id,
      'hospital_selected_by_doctor',
      'New treatment plan for your hospital',
      coalesce(v_doctor_name, 'A doctor') || ' submitted a treatment plan naming your hospital for ' ||
        coalesce(public.decrypt_pii(NEW.procedure_name_enc), 'a case') || '.',
      NEW.case_id
    );
  end if;

  return NEW;
end;
$$;
