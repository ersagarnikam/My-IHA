-- Consent and record retention (Australian Privacy Principles; for MTA's lawyer to confirm):
--  * Every sign-up records what the person agreed to and which version:
--    the terms and privacy policy, and (patients) collecting their health
--    information and sharing it with doctors, hospitals and visa lawyers.
--  * The privacy policy and terms links, the consent version and how many
--    years records are kept after an account is closed are admin settings.
--  * Deleting a patient account no longer erases the health and payment
--    records straight away: after the grace period the login and contact
--    details are erased and the records are kept until retain_until.

create table consents (
  id          uuid                     primary key,
  user_id     uuid                     not null references app_users (id) on delete cascade,
  kind        varchar                  not null,
  version     varchar                  not null,
  accepted_at timestamp with time zone not null,
  constraint consents_kind_check check (kind in ('terms_and_privacy', 'health_information'))
);

create index consents_user_idx on consents (user_id);

insert into business_settings (setting_key, setting_value) values
  ('privacy_policy_url', 'https://medicaltourismaustralia.com/privacy-policy/'),
  ('terms_url', 'https://medicaltourismaustralia.com/terms-and-conditions/'),
  ('consent_version', '2026-10'),
  ('retention_years', '7');

alter table patients add column account_closed_at timestamp with time zone;
alter table patients add column retain_until timestamp with time zone;
