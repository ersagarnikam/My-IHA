-- Lawyer Account & Settings: notification preferences, plus write paths for
-- the Personal Info tab's two cards (Lawyer/Firm Information, Professional
-- Details). Mirrors 20260728010000_add_hospital_account_settings.sql.
--
-- registration_number/abn_number are encrypted (registration_number_enc/
-- abn_number_enc, see 20260826010000_create_lawyers_table.sql) so they can't
-- be written via a plain client-side `.update()` — update_lawyer_basic_info
-- is the only write path for those columns.

alter table public.lawyers
  add column if not exists email_notifications_enabled boolean not null default true,
  add column if not exists sms_notifications_enabled boolean not null default true;

create or replace function public.update_lawyer_basic_info(
  p_name                text,
  p_registration_number text,
  p_abn_number          text,
  p_contact_phone       text,
  p_address             text,
  p_city                text,
  p_zip_code            text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.lawyers
  set name = p_name,
      registration_number_enc = public.encrypt_pii(p_registration_number),
      abn_number_enc = public.encrypt_pii(p_abn_number),
      contact_phone = p_contact_phone,
      address = p_address,
      city = p_city,
      zip_code = p_zip_code
  where user_id = auth.uid();
end;
$$;

revoke all on function public.update_lawyer_basic_info(text, text, text, text, text, text, text) from public;
grant execute on function public.update_lawyer_basic_info(text, text, text, text, text, text, text) to authenticated;

create or replace function public.update_lawyer_professional_details(
  p_lawyer_type                   text,
  p_immigration_law_certification text
)
returns void
language plpgsql
set search_path = ''
as $$
begin
  update public.lawyers
  set lawyer_type = p_lawyer_type,
      immigration_law_certification = p_immigration_law_certification
  where user_id = auth.uid();
end;
$$;

revoke all on function public.update_lawyer_professional_details(text, text) from public;
grant execute on function public.update_lawyer_professional_details(text, text) to authenticated;
