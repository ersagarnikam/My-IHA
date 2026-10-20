-- Additions needed by the doctor portal port.

-- One plan per doctor per case (the old save_treatment_plan_draft upserted on this pair).
alter table treatment_plans add constraint treatment_plans_case_doctor_key unique (case_id, doctor_id);
create index treatment_plans_doctor_idx on treatment_plans (doctor_id);

-- One support thread per provider account.
alter table provider_message_threads add constraint provider_message_threads_doctor_key unique (doctor_id);
alter table provider_message_threads add constraint provider_message_threads_hospital_key unique (hospital_id);
alter table provider_message_threads add constraint provider_message_threads_lawyer_key unique (lawyer_id);
create index provider_messages_thread_idx on provider_messages (thread_id, created_at);

create index doctor_fee_payments_doctor_idx on doctor_fee_payments (doctor_id);
create index doctor_fee_payments_intent_idx on doctor_fee_payments (stripe_payment_intent_id);
create index consultation_requests_option_idx on consultation_requests (treatment_option_id);

-- Documents a doctor asked the patient for during evaluation. Marked received
-- when the patient adds a document of that type to the case.
create table case_document_requests (
  id            uuid                     primary key,
  case_id       uuid                     not null references cases (id) on delete cascade,
  doctor_id     uuid                     not null references doctors (id) on delete cascade,
  document_type varchar                  not null,
  message       varchar,
  status        varchar                  not null,
  requested_at  timestamp with time zone not null,
  received_at   timestamp with time zone,
  constraint case_document_requests_type_check check (document_type in (
    'lab_report', 'mri_ct', 'xray', 'prescription', 'medical_history', 'other'
  )),
  constraint case_document_requests_status_check check (status in ('pending', 'received'))
);
create index case_document_requests_case_idx on case_document_requests (case_id);
