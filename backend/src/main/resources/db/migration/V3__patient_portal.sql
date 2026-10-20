-- Additions needed by the patient portal port.

-- One code table for both email verification and password reset.
alter table email_verification_codes add column purpose varchar not null default 'verify_email';
alter table email_verification_codes
  add constraint email_verification_codes_purpose_check check (purpose in ('verify_email', 'reset_password'));

-- Lawyer document review (added late in the old schema, missing from its generated types).
alter table visa_documents add column review_status varchar;
alter table visa_documents
  add constraint visa_documents_review_status_check
  check (review_status is null or review_status in ('accepted', 'insufficient', 'missing'));

-- At most one pending payment per consultation / per case treatment payment is
-- enforced in PaymentService; these indexes keep the lookups cheap.
create index payments_consultation_idx on payments (consultation_request_id);
create index payments_intent_idx on payments (stripe_payment_intent_id);
create index consultation_requests_case_idx on consultation_requests (case_id);
create index visa_documents_patient_idx on visa_documents (patient_id);
create index chat_messages_unread_idx on chat_messages (thread_id, sender_type, read);
