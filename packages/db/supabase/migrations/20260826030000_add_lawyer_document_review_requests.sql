-- ─────────────────────────────────────────────────────────
-- Visa Lawyer Portal: document review + document requests (Module 04)
-- Extends the lawyer_has_access_to_case() gate from 20260826020000 to
-- visa_documents and treatment_plans (cases/patients already got it there).
-- ─────────────────────────────────────────────────────────

create policy "Lawyers can view documents on their assigned cases"
  on public.visa_documents for select
  to authenticated
  using (case_id is not null and public.lawyer_has_access_to_case(case_id));

create policy "Lawyers can view treatment plans on their assigned cases"
  on public.treatment_plans for select
  to authenticated
  using (public.lawyer_has_access_to_case(case_id));

-- ─────────────────────────────────────────────────────────
-- 4.1 Document Review — review_status on visa_documents. Single column set,
-- not a history table: SOW doesn't require preserving multiple review
-- passes.
-- ─────────────────────────────────────────────────────────
alter table public.visa_documents
  add column review_status text,
  add column reviewed_at   timestamptz,
  add column reviewed_by   uuid references public.lawyers (id);

alter table public.visa_documents
  add constraint visa_documents_review_status_check
  check (review_status is null or review_status in ('accepted', 'insufficient', 'missing'));

create or replace function public.review_visa_document(
  p_document_id   uuid,
  p_review_status text
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lawyer_id uuid;
  v_case_id   uuid;
begin
  select id into v_lawyer_id from public.lawyers where user_id = auth.uid();
  if v_lawyer_id is null then
    raise exception 'unauthorized';
  end if;

  if p_review_status not in ('accepted', 'insufficient', 'missing') then
    raise exception 'invalid_review_status';
  end if;

  select case_id into v_case_id from public.visa_documents where id = p_document_id;
  if v_case_id is null or not public.lawyer_has_access_to_case(v_case_id) then
    raise exception 'unauthorized';
  end if;

  update public.visa_documents set
    review_status = p_review_status,
    reviewed_at   = now(),
    reviewed_by   = v_lawyer_id
  where id = p_document_id;
end;
$$;

revoke execute on function public.review_visa_document from public;
grant execute on function public.review_visa_document to authenticated;

-- ─────────────────────────────────────────────────────────
-- 4.2 Document Requests — a real table (not the requested_by_lawyer boolean)
-- so multiple, individually-tracked requests with instructions/history are
-- representable. "Fulfilled" is computed at read time (see
-- lib/data/documents.ts) against visa_documents.requested_by_lawyer +
-- uploaded_at, not stored here.
-- ─────────────────────────────────────────────────────────
create table public.visa_document_requests (
  id            uuid        primary key default gen_random_uuid(),
  case_id       uuid        not null references public.cases (id) on delete cascade,
  lawyer_id     uuid        not null references public.lawyers (id),
  category      text        not null,
  document_type text        not null,
  instructions  text,
  created_at    timestamptz not null default now()
);

alter table public.visa_document_requests enable row level security;

create index on public.visa_document_requests (case_id);

create policy "Lawyers can view requests on their assigned cases"
  on public.visa_document_requests for select
  to authenticated
  using (public.lawyer_has_access_to_case(case_id));

create policy "Lawyers can create requests on their assigned cases"
  on public.visa_document_requests for insert
  to authenticated
  with check (
    lawyer_id = (select id from public.lawyers where user_id = auth.uid())
    and public.lawyer_has_access_to_case(case_id)
  );

-- Forward-compatible: no patient-facing UI reads this yet, but the policy is
-- correct now rather than an afterthought when that UI gets built.
create policy "Patients can view requests on their own cases"
  on public.visa_document_requests for select
  to authenticated
  using (
    case_id in (select id from public.cases where patient_id = (select id from public.patients where user_id = auth.uid()))
  );

create or replace function public.request_visa_document(
  p_case_id      uuid,
  p_category     text,
  p_document_type text,
  p_instructions text
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lawyer_id       uuid;
  v_request_id      uuid;
  v_patient_user_id uuid;
begin
  select id into v_lawyer_id from public.lawyers where user_id = auth.uid();
  if v_lawyer_id is null or not public.lawyer_has_access_to_case(p_case_id) then
    raise exception 'unauthorized';
  end if;

  insert into public.visa_document_requests (case_id, lawyer_id, category, document_type, instructions)
  values (p_case_id, v_lawyer_id, p_category, p_document_type, p_instructions)
  returning id into v_request_id;

  update public.visa_submissions
  set status = 'additional_docs_requested'
  where case_id = p_case_id;

  select p.user_id into v_patient_user_id
  from public.visa_submissions vs
  join public.patients p on p.id = vs.patient_id
  where vs.case_id = p_case_id;

  if v_patient_user_id is not null then
    insert into public.notifications (user_id, type, title, message, case_id)
    values (
      v_patient_user_id,
      'document_requested',
      'Your visa lawyer requested a document',
      'Please upload: ' || p_document_type || coalesce(' — ' || nullif(p_instructions, ''), ''),
      p_case_id
    );
  end if;

  return v_request_id;
end;
$$;

revoke execute on function public.request_visa_document from public;
grant execute on function public.request_visa_document to authenticated;
