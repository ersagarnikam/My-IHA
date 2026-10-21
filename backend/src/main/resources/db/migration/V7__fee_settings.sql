-- Admin-editable platform fees: who changed each fee last, a change history,
-- and the fees that used to be constants in code (consultation fee, suggested
-- MTA service fee). Lawyer and hospital fees start at 0 (not charged yet).

alter table platform_fee_settings add column updated_by varchar;

create table platform_fee_changes (
  id         uuid                     primary key,
  fee_key    varchar                  not null,
  old_amount numeric(12, 2),
  new_amount numeric(12, 2)           not null,
  reason     varchar,
  changed_by varchar,
  changed_at timestamp with time zone not null
);

create index platform_fee_changes_changed_at_idx on platform_fee_changes (changed_at);

insert into platform_fee_settings (id, fee_key, amount_aud) values
  ('3f1d6c2a-8b4e-4f71-9a2d-5c7e1b0a9d11', 'consultation_fee', 200.00),
  ('5a9e2b7c-1d3f-4c8a-b6e0-7f2d4a1c8e22', 'mta_service_fee_pct', 10.00),
  ('8c4b1e9d-2a7f-4e3b-9d5c-1a6f8b2e4c33', 'lawyer_registration_fee', 0.00),
  ('b2e7f4a1-6c9d-4a2e-8f1b-3d5a7c9e1f44', 'lawyer_annual_fee', 0.00),
  ('d6a3c8e5-4f2b-4d9a-a7c1-9e8b2f4d6a55', 'hospital_registration_fee', 0.00),
  ('e9f1b5d7-3a8c-4b6e-9c2d-6f4a1e7b3c66', 'hospital_annual_fee', 0.00);
