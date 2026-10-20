-- Patients can view (select) and create (insert) their own payments rows, but there
-- was no way for the patient-facing intent-creation routes (consultation-intent,
-- create-intent) to write stripe_payment_intent_id onto an existing pending row.
-- The row stayed stuck with a null intent id even after the payment succeeded,
-- since the webhook (service role, bypasses RLS) matches on
-- stripe_payment_intent_id and found nothing to update.
--
-- A blanket UPDATE RLS policy would fix that, but RLS only filters rows, not
-- columns — "status = 'pending'" in using/with check stops a patient flipping
-- status themselves, but not rewriting amount_aud, case_id, payment_type, or
-- (most seriously) stripe_payment_intent_id on their own pending row via a
-- direct PostgREST call, bypassing the app's routes entirely. Retargeting
-- stripe_payment_intent_id onto a cheaper intent they're actually about to pay
-- would let the webhook mark an unrelated, unpaid row "completed".
--
-- So instead of a table policy, this goes through a security definer RPC that
-- only ever sets stripe_payment_intent_id, only while it's still null (never
-- reassigns an already-claimed value — combined with the column's unique
-- constraint, a patient can never steal an intent id already attached to
-- another row), scoped to a pending row they own — mirroring the
-- confirm_treatment_option / update_case_travel_assistance RPC pattern used
-- elsewhere in this schema for patient-facing mutations.
create or replace function public.set_payment_stripe_intent(
  p_payment_id uuid,
  p_stripe_payment_intent_id text
)
returns public.payments
language plpgsql
security definer
set search_path = public
as $$
declare
  v_owns_payment boolean;
  v_status       text;
  v_result       public.payments;
begin
  select (pt.user_id = auth.uid()), pay.status
  into v_owns_payment, v_status
  from public.payments pay
  join public.patients pt on pt.id = pay.patient_id
  where pay.id = p_payment_id;

  if v_status is null then
    raise exception 'payment_not_found';
  end if;

  if not coalesce(v_owns_payment, false) then
    raise exception 'unauthorized';
  end if;

  if v_status != 'pending' then
    raise exception 'payment_not_pending';
  end if;

  -- The "stripe_payment_intent_id is null" guard is the concurrency gate: if
  -- another call already claimed this row (or it was claimed since v_status
  -- was read above), zero rows match and v_result stays null, signalling the
  -- caller to defer to whichever call actually won.
  update public.payments
  set stripe_payment_intent_id = p_stripe_payment_intent_id
  where id = p_payment_id
    and stripe_payment_intent_id is null
  returning * into v_result;

  return v_result;
end;
$$;

revoke all on function public.set_payment_stripe_intent(uuid, text) from public;
grant execute on function public.set_payment_stripe_intent(uuid, text) to authenticated;
