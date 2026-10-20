-- ─────────────────────────────────────────────────────────
-- RPC: create_doctor_fee_payment
--
-- Security definer so it can insert into doctor_fee_payments (no client
-- insert policy exists) while still guaranteeing the amount always comes
-- from platform_fee_settings, never from the caller. Get-or-creates the
-- caller's pending row for the requested fee type — idempotent, mirrors the
-- existing-row check in packages/db/src/payments.ts's upsertPendingPayment,
-- so a reload/double-mount of the payment page never creates a second
-- pending row (the partial unique indexes on doctor_fee_payments back this
-- up at the DB level too).
-- ─────────────────────────────────────────────────────────
create or replace function public.create_doctor_fee_payment(
  p_fee_type text
)
returns public.doctor_fee_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_doctor  public.doctors;
  v_amount  numeric(10,2);
  v_result  public.doctor_fee_payments;
begin
  if auth.uid() is null then
    raise exception 'unauthenticated';
  end if;

  select * into v_doctor from public.doctors where user_id = auth.uid();
  if v_doctor.id is null then
    raise exception 'doctor_not_found';
  end if;

  if p_fee_type = 'registration' then
    if v_doctor.status != 'approved' then
      raise exception 'not_approved';
    end if;
    if v_doctor.registration_fee_paid_at is not null then
      raise exception 'already_paid';
    end if;

    select * into v_result from public.doctor_fee_payments
    where doctor_id = v_doctor.id and fee_type = 'registration' and status = 'pending'
    order by created_at desc
    limit 1;

    if found then
      return v_result;
    end if;

    select amount_aud into v_amount from public.platform_fee_settings
    where fee_key = 'doctor_registration_fee';
    if v_amount is null then
      raise exception 'fee_not_configured';
    end if;

    insert into public.doctor_fee_payments (doctor_id, fee_type, amount_aud, status, gateway)
    values (v_doctor.id, 'registration', v_amount, 'pending', 'stripe')
    returning * into v_result;

    return v_result;

  elsif p_fee_type = 'annual' then
    if v_doctor.registration_fee_paid_at is null then
      raise exception 'registration_fee_not_paid';
    end if;
    if v_doctor.annual_fee_next_due_at is null or v_doctor.annual_fee_next_due_at > current_date then
      raise exception 'not_due_yet';
    end if;

    select * into v_result from public.doctor_fee_payments
    where doctor_id = v_doctor.id
      and fee_type = 'annual'
      and billing_period = v_doctor.annual_fee_next_due_at
      and status = 'pending'
    order by created_at desc
    limit 1;

    if found then
      return v_result;
    end if;

    select amount_aud into v_amount from public.platform_fee_settings
    where fee_key = 'doctor_annual_fee';
    if v_amount is null then
      raise exception 'fee_not_configured';
    end if;

    insert into public.doctor_fee_payments (doctor_id, fee_type, billing_period, amount_aud, status, gateway)
    values (v_doctor.id, 'annual', v_doctor.annual_fee_next_due_at, v_amount, 'pending', 'stripe')
    returning * into v_result;

    return v_result;

  else
    raise exception 'invalid_fee_type';
  end if;
end;
$$;

revoke all on function public.create_doctor_fee_payment(text) from public;
grant execute on function public.create_doctor_fee_payment(text) to authenticated;

-- ─────────────────────────────────────────────────────────
-- RPC: set_doctor_fee_payment_stripe_intent
--
-- Same shape and rationale as set_payment_stripe_intent
-- (20260812040000_add_payments_update_rls.sql): the only client-writable
-- path onto stripe_payment_intent_id, scoped to the caller's own pending
-- row, and only while it's still null — never reassigns an already-claimed
-- value (combined with the column's unique constraint, a doctor can't steal
-- an intent id already attached to another row).
-- ─────────────────────────────────────────────────────────
create or replace function public.set_doctor_fee_payment_stripe_intent(
  p_payment_id uuid,
  p_stripe_payment_intent_id text
)
returns public.doctor_fee_payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owns_payment boolean;
  v_status       text;
  v_result       public.doctor_fee_payments;
begin
  select (d.user_id = auth.uid()), p.status
  into v_owns_payment, v_status
  from public.doctor_fee_payments p
  join public.doctors d on d.id = p.doctor_id
  where p.id = p_payment_id;

  if v_status is null then
    raise exception 'payment_not_found';
  end if;

  if not coalesce(v_owns_payment, false) then
    raise exception 'unauthorized';
  end if;

  if v_status != 'pending' then
    raise exception 'payment_not_pending';
  end if;

  update public.doctor_fee_payments
  set stripe_payment_intent_id = p_stripe_payment_intent_id
  where id = p_payment_id
    and stripe_payment_intent_id is null
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.set_doctor_fee_payment_stripe_intent(uuid, text) from public;
grant execute on function public.set_doctor_fee_payment_stripe_intent(uuid, text) to authenticated;
