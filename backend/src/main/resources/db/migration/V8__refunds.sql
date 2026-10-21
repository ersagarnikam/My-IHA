-- Admin refunds (full or partial) of patient payments and doctor fees. The card
-- processing fee is deducted from refunds (once per payment) unless admin waives it.

create table payment_refunds (
  id                uuid                     primary key,
  payment_kind      varchar                  not null,
  payment_id        uuid                     not null,
  case_id           uuid,
  amount_aud        numeric(12, 2)           not null,
  fee_deducted_aud  numeric(12, 2)           not null,
  refunded_aud      numeric(12, 2)           not null,
  fee_source        varchar                  not null,
  reason            varchar                  not null,
  note              varchar,
  status            varchar                  not null,
  gateway           varchar                  not null,
  gateway_refund_id varchar,
  created_by        varchar,
  created_at        timestamp with time zone not null,
  completed_at      timestamp with time zone,
  constraint payment_refunds_kind_check check (payment_kind in ('patient', 'doctor')),
  constraint payment_refunds_status_check check (status in ('pending', 'succeeded', 'failed')),
  constraint payment_refunds_fee_source_check check (fee_source in ('stripe', 'estimate', 'waived', 'none'))
);

create index payment_refunds_payment_idx on payment_refunds (payment_id);

alter table doctor_fee_payments drop constraint doctor_fee_payments_status_check;
alter table doctor_fee_payments add constraint doctor_fee_payments_status_check
  check (status in ('pending', 'completed', 'failed', 'refunded'));

-- Used to work out the card fee when the provider can't report it (the simulated provider).
insert into platform_fee_settings (id, fee_key, amount_aud) values
  ('f2a8c4e6-1b3d-4f5a-8c7e-2d4b6a8c0e77', 'card_fee_pct', 1.75),
  ('0b4d6f8a-2c5e-4a7b-9d1f-3e5a7c9b1d88', 'card_fee_fixed_aud', 0.30);
