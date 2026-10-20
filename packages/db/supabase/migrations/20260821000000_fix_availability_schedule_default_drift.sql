-- Bug: doctors.availability_schedule's column default had drifted on the
-- live database to a hardcoded Mon-Sat schedule, out of step with every
-- migration file (which all say default '[]'::jsonb). register_doctor never
-- sets availability_schedule explicitly on insert, so every newly registered
-- doctor got this Mon-Sat default baked in immediately. fetchDoctorAccountSettings
-- (apps/doctor/lib/data/account-settings.ts) only derives the Availability tab
-- from working_days when availability_schedule is empty, so the tab always
-- showed the stale Mon-Sat default instead of the days picked at registration,
-- no matter what working_days held. This restores the intended default and
-- resets any doctor row still sitting on that exact bogus default back to
-- empty so it re-derives from working_days; doctors who have genuinely edited
-- and saved their own schedule (any different from this literal) are untouched.

alter table public.doctors
  alter column availability_schedule set default '[]'::jsonb;

update public.doctors
set availability_schedule = '[]'::jsonb
where availability_schedule = '[
  {"day": "monday", "enabled": true, "start_time": "09:00", "end_time": "17:00"},
  {"day": "tuesday", "enabled": true, "start_time": "09:00", "end_time": "17:00"},
  {"day": "wednesday", "enabled": true, "start_time": "09:00", "end_time": "17:00"},
  {"day": "thursday", "enabled": true, "start_time": "09:00", "end_time": "17:00"},
  {"day": "friday", "enabled": true, "start_time": "09:00", "end_time": "17:00"},
  {"day": "saturday", "enabled": true, "start_time": "09:00", "end_time": "17:00"},
  {"day": "sunday", "enabled": false, "start_time": "09:00", "end_time": "17:00"}
]'::jsonb;
