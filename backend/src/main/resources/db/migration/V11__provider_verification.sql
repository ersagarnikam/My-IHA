-- Verification before and after approval (Australian launch):
--  * MTA records each check it makes: a doctor's AHPRA register entry, a
--    hospital's NSQHS accreditation and state licence. The latest check of a
--    kind is the current one; approval needs a passing check.
--  * Doctors declare professional indemnity (insurer, policy, expiry, cover
--    for patients located overseas) and acknowledge the Medical Board's
--    telehealth guidelines before offering Zoom consultations.
--  * Hospitals give their accreditation and licence expiry dates.

create table provider_verifications (
  id            uuid                     primary key,
  provider_type varchar                  not null,
  provider_id   uuid                     not null,
  check_type    varchar                  not null,
  outcome       varchar                  not null,
  valid_until   date,
  details       varchar,
  checked_by    varchar,
  checked_at    timestamp with time zone not null,
  constraint provider_verifications_type_check check (provider_type in ('doctor', 'hospital')),
  constraint provider_verifications_check_type_check check (check_type in ('ahpra', 'accreditation', 'licence')),
  constraint provider_verifications_outcome_check check (outcome in ('verified', 'verified_with_conditions', 'failed'))
);

create index provider_verifications_provider_idx on provider_verifications (provider_id);

alter table doctors add column indemnity_insurer varchar;
alter table doctors add column indemnity_policy_number_enc varchar;
alter table doctors add column indemnity_expires_on date;
alter table doctors add column indemnity_covers_overseas boolean not null default false;
alter table doctors add column telehealth_guidelines_ack boolean not null default false;
alter table doctors add column indemnity_declared_at timestamp with time zone;

alter table hospitals add column accreditation_expires_on date;
alter table hospitals add column licence_expires_on date;
