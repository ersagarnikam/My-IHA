-- Registration and annual membership fees for hospitals and visa lawyers,
-- like doctors' (doctor_fee_payments). While a fee is set to 0 it isn't
-- charged: approval then records the registration fee as waived and starts the
-- yearly cycle. Hospitals and lawyers approved before this migration joined
-- while the fees were 0, so their registration counts as waived from today.

alter table hospitals add column registration_fee_paid_at timestamp with time zone;
alter table hospitals add column registration_fee_waived boolean not null default false;
alter table hospitals add column annual_fee_next_due_at timestamp with time zone;

alter table lawyers add column registration_fee_paid_at timestamp with time zone;
alter table lawyers add column registration_fee_waived boolean not null default false;
alter table lawyers add column annual_fee_next_due_at timestamp with time zone;

update hospitals set registration_fee_paid_at = current_timestamp, registration_fee_waived = true
  where status = 'approved';
update lawyers set registration_fee_paid_at = current_timestamp, registration_fee_waived = true
  where status = 'approved';

create table provider_fee_payments (
  id                       uuid                     primary key,
  provider_type            varchar                  not null,
  provider_id              uuid                     not null,
  fee_type                 varchar                  not null,
  amount_aud               numeric(12, 2)           not null,
  billing_period           varchar,
  status                   varchar                  not null,
  gateway                  varchar                  not null,
  gateway_reference        varchar,
  stripe_payment_intent_id varchar,
  paid_at                  timestamp with time zone,
  created_at               timestamp with time zone not null,
  constraint provider_fee_payments_type_check check (provider_type in ('hospital', 'lawyer')),
  constraint provider_fee_payments_fee_check check (fee_type in ('registration', 'annual')),
  constraint provider_fee_payments_status_check check (status in ('pending', 'completed', 'failed', 'refunded'))
);

create index provider_fee_payments_provider_idx on provider_fee_payments (provider_type, provider_id);
create index provider_fee_payments_intent_idx on provider_fee_payments (stripe_payment_intent_id);

alter table payment_refunds drop constraint payment_refunds_kind_check;
alter table payment_refunds add constraint payment_refunds_kind_check
  check (payment_kind in ('patient', 'doctor', 'hospital', 'lawyer'));

-- Taxable like doctor membership fees, until MTA's accountant says otherwise.
insert into business_settings (setting_key, setting_value) values ('gst_provider_fees', 'true');
