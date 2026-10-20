-- ─────────────────────────────────────────────────────────
-- lawyers: Visa Lawyer Portal self-registration (Module 01)
-- Single table for both individual lawyers and law firms, discriminated by
-- lawyer_type — mirrors the hospitals/doctors self-registration shape
-- (pending/approved/rejected/more_info_requested, RPC-only insert, no
-- client insert policy). registration_number/abn_number are encrypted at
-- rest from the start (no separate rename-then-encrypt migration needed,
-- unlike hospitals/doctors which had to retrofit this onto existing data).
--
-- lead_lawyer_id is reserved for Module 02 (law firm member management) —
-- a self-registering law firm's own row represents its Lead Lawyer; adding
-- individual member-lawyer rows under a firm is out of scope here.
-- ─────────────────────────────────────────────────────────
create table public.lawyers (
  id                          uuid        primary key default gen_random_uuid(),
  user_id                     uuid        unique references auth.users (id),
  status                      text        not null default 'pending',
  lawyer_type                 text        not null,
  name                        text        not null,
  registration_number_enc     bytea,
  abn_number_enc              bytea,
  immigration_law_certification text,
  contact_phone               text,
  address                     text,
  city                        text,
  zip_code                    text,
  certificates                jsonb       not null default '[]'::jsonb,
  lead_lawyer_id              uuid        references public.lawyers (id),
  rejection_reason            text,
  more_info_message           text,
  created_at                  timestamptz not null default now(),
  updated_at                  timestamptz not null default now()
);

alter table public.lawyers
  add constraint lawyers_status_check
  check (status in ('pending', 'approved', 'rejected', 'more_info_requested'));

alter table public.lawyers
  add constraint lawyers_type_check
  check (lawyer_type in ('individual', 'law_firm'));

alter table public.lawyers enable row level security;

-- Self-service reads/updates for the owning lawyer account. No insert
-- policy — rows are only created via the register_lawyer() RPC so status
-- can't be spoofed to anything but 'pending'.
create policy "Lawyers can read own account row"
  on public.lawyers for select
  to authenticated
  using (user_id = auth.uid());

create policy "Lawyers can update own account row"
  on public.lawyers for update
  to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create trigger lawyers_set_updated_at
  before update on public.lawyers
  for each row execute function public.set_updated_at();

-- Decrypting computed columns, same pattern as hospitals/doctors.
create or replace function public.registration_number(l public.lawyers)
returns text
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(l.registration_number_enc) $$;

create or replace function public.abn_number(l public.lawyers)
returns text
language sql
stable
set search_path = ''
as $$ select public.decrypt_pii(l.abn_number_enc) $$;

grant execute on function public.registration_number(public.lawyers) to authenticated;
grant execute on function public.abn_number(public.lawyers) to authenticated;

revoke select (registration_number_enc, abn_number_enc)
  on public.lawyers from authenticated, anon;

-- ─────────────────────────────────────────────────────────
-- RPC: register_lawyer
-- security definer so it can insert into lawyers (no client insert policy
-- exists) while guaranteeing status always starts 'pending' and user_id is
-- always the caller's own id. Mirrors register_hospital/register_doctor.
-- ─────────────────────────────────────────────────────────
create or replace function public.register_lawyer(
  p_name                          text,
  p_lawyer_type                   text,
  p_registration_number           text,
  p_abn_number                    text,
  p_immigration_law_certification text,
  p_contact_phone                 text,
  p_address                       text,
  p_city                          text,
  p_zip_code                      text,
  p_certificates                  jsonb
)
returns uuid
language plpgsql
security definer
set search_path = public
as $$
declare
  v_lawyer_id uuid;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  if exists (select 1 from public.hospitals where user_id = auth.uid())
     or exists (select 1 from public.doctors where user_id = auth.uid())
     or exists (select 1 from public.lawyers where user_id = auth.uid()) then
    raise exception 'already_registered';
  end if;

  insert into public.lawyers (
    user_id, status, lawyer_type, name,
    registration_number_enc, abn_number_enc,
    immigration_law_certification, contact_phone, address, city, zip_code,
    certificates
  ) values (
    auth.uid(), 'pending', p_lawyer_type, p_name,
    public.encrypt_pii(p_registration_number), public.encrypt_pii(p_abn_number),
    p_immigration_law_certification, p_contact_phone, p_address, p_city, p_zip_code,
    coalesce(p_certificates, '[]'::jsonb)
  )
  returning id into v_lawyer_id;

  return v_lawyer_id;
end;
$$;

revoke execute on function public.register_lawyer from public;
grant execute on function public.register_lawyer to authenticated;

-- ─────────────────────────────────────────────────────────
-- RPC: resubmit_lawyer_registration
-- Reopens a rejected/more_info_requested row in place (not a duplicate).
-- ─────────────────────────────────────────────────────────
create or replace function public.resubmit_lawyer_registration(
  p_lawyer_id                     uuid,
  p_name                          text,
  p_lawyer_type                   text,
  p_registration_number           text,
  p_abn_number                    text,
  p_immigration_law_certification text,
  p_contact_phone                 text,
  p_address                       text,
  p_city                          text,
  p_zip_code                      text,
  p_certificates                  jsonb
)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if not exists (
    select 1 from public.lawyers
    where id = p_lawyer_id
      and user_id = auth.uid()
      and status in ('rejected', 'more_info_requested')
  ) then
    raise exception 'not_resubmittable';
  end if;

  update public.lawyers set
    name = p_name,
    lawyer_type = p_lawyer_type,
    registration_number_enc = public.encrypt_pii(p_registration_number),
    abn_number_enc = public.encrypt_pii(p_abn_number),
    immigration_law_certification = p_immigration_law_certification,
    contact_phone = p_contact_phone,
    address = p_address,
    city = p_city,
    zip_code = p_zip_code,
    certificates = coalesce(p_certificates, '[]'::jsonb),
    status = 'pending',
    rejection_reason = null,
    more_info_message = null
  where id = p_lawyer_id;
end;
$$;

revoke execute on function public.resubmit_lawyer_registration from public;
grant execute on function public.resubmit_lawyer_registration to authenticated;
