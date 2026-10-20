-- ─────────────────────────────────────────────────────────
-- Soft reminder for the annual renewal fee — an in-portal notification only,
-- no access is blocked on non-payment (v1 decision). Fires once per billing
-- cycle, 14 days before annual_fee_next_due_at, deduped via
-- annual_fee_reminder_sent_for so it doesn't repeat daily inside that
-- window. Mirrors the pg_cron pattern in
-- 20260612000004_hard_delete_expired_patients.sql.
-- ─────────────────────────────────────────────────────────
create or replace function public.notify_doctors_of_upcoming_annual_fee()
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.notifications (user_id, type, title, message)
  select
    d.user_id,
    'annual_fee_due',
    'Annual fee due',
    'Your annual renewal fee of $' || s.amount_aud || ' AUD is due on ' || d.annual_fee_next_due_at || '.'
  from public.doctors d
  cross join public.platform_fee_settings s
  where s.fee_key = 'doctor_annual_fee'
    and d.status = 'approved'
    and d.user_id is not null
    and d.annual_fee_next_due_at is not null
    and d.annual_fee_next_due_at <= current_date + interval '14 days'
    and d.annual_fee_reminder_sent_for is distinct from d.annual_fee_next_due_at;

  update public.doctors
  set annual_fee_reminder_sent_for = annual_fee_next_due_at
  where status = 'approved'
    and annual_fee_next_due_at is not null
    and annual_fee_next_due_at <= current_date + interval '14 days'
    and annual_fee_reminder_sent_for is distinct from annual_fee_next_due_at;
end;
$$;

revoke all on function public.notify_doctors_of_upcoming_annual_fee() from public, anon, authenticated;

do $$
begin
  if exists (select 1 from cron.job where jobname = 'notify-doctors-annual-fee-due') then
    perform cron.unschedule('notify-doctors-annual-fee-due');
  end if;
end
$$;

select cron.schedule(
  'notify-doctors-annual-fee-due',
  '0 4 * * *',
  $$select public.notify_doctors_of_upcoming_annual_fee();$$
);
