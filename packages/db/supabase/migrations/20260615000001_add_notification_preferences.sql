-- Per-channel notification preferences for patients. In-portal notifications
-- cannot be disabled; these toggles only control email/SMS delivery.

alter table public.patients
  add column email_notifications_enabled boolean not null default true,
  add column sms_notifications_enabled boolean not null default true;
