-- Initial Zoom consultation: during evaluation the doctor proposes times, the
-- patient picks one and pays, and the meeting must take place (or the doctor
-- records why it wasn't needed) before the treatment plan can be submitted.
-- The existing consultation about a published treatment option stays as an
-- optional follow-up (kind 'option').

alter table consultation_requests add column kind varchar not null default 'option';
alter table consultation_requests
  add constraint consultation_requests_kind_check check (kind in ('initial', 'option'));

-- Initial consultations have no treatment option yet; they belong to a doctor directly.
alter table consultation_requests alter column treatment_option_id drop not null;
alter table consultation_requests add column doctor_id uuid;
alter table consultation_requests
  add constraint consultation_requests_doctor_fk foreign key (doctor_id) references doctors (id) on delete set null;
create index consultation_requests_doctor_idx on consultation_requests (doctor_id);

-- A doctor can skip the initial consultation with a reason MTA can see.
alter table doctor_case_assignments add column consultation_skipped_reason varchar;
alter table doctor_case_assignments add column consultation_skipped_at timestamp with time zone;
