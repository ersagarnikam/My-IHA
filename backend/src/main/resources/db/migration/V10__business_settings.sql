-- MTA's own business details for tax invoices, and which charges carry GST.
-- GST stays off until MTA confirms its registration (admin → Settings); the
-- per-charge defaults are a starting point for MTA's accountant to confirm:
-- medical treatment and consultations GST-free, MTA's service fee and doctor
-- membership fees taxable.

create table business_settings (
  setting_key   varchar                  primary key,
  setting_value varchar,
  updated_at    timestamp with time zone not null default current_timestamp,
  updated_by    varchar
);

insert into business_settings (setting_key, setting_value) values
  ('legal_name', 'Medical Tourism Australia'),
  ('abn', ''),
  ('address', ''),
  ('email', ''),
  ('gst_registered', 'false'),
  ('gst_mta_service_fee', 'true'),
  ('gst_doctor_fees', 'true'),
  ('gst_consultation_fee', 'false'),
  ('gst_treatment_costs', 'false');
