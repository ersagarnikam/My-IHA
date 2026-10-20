-- Email and SMS notifications should both be on by default for doctors
-- (email already defaulted true; sms defaulted false in
-- 20260724120000_add_doctor_account_settings_fields.sql). Backfill existing
-- rows too, since this column was only just introduced and nobody has
-- knowingly opted out yet. Hospitals already default sms to true (see
-- 20260728010000_add_hospital_account_settings.sql), so no change needed
-- there.
alter table public.doctors alter column sms_notifications_enabled set default true;

update public.doctors set sms_notifications_enabled = true where sms_notifications_enabled = false;
