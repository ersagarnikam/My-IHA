-- The visa lawyer portal. In Australia immigration assistance may be given by
-- a registered migration agent (MARN, on the OMARA register) or by an
-- Australian legal practitioner holding a current practising certificate
-- (no MARN needed since 2021). Lawyers say which at registration; MTA checks
-- that register before approval (provider_verifications).

alter table lawyers add column contact_email varchar;
alter table lawyers add column credential_type varchar;
alter table lawyers add column practising_state varchar;
alter table lawyers add column credential_expires_on date;
alter table lawyers add column time_zone varchar not null default 'Australia/Brisbane';
alter table lawyers add constraint lawyers_credential_type_check
  check (credential_type is null or credential_type in ('marn', 'practising_certificate'));

alter table provider_verifications drop constraint provider_verifications_type_check;
alter table provider_verifications add constraint provider_verifications_type_check
  check (provider_type in ('doctor', 'hospital', 'lawyer'));
alter table provider_verifications drop constraint provider_verifications_check_type_check;
alter table provider_verifications add constraint provider_verifications_check_type_check
  check (check_type in ('ahpra', 'accreditation', 'licence', 'marn', 'practising_certificate'));

create index visa_submissions_lawyer_idx on visa_submissions (assigned_lawyer_id);
create index visa_case_notes_case_idx on visa_case_notes (case_id);
create index visa_document_requests_case_idx on visa_document_requests (case_id);
