-- No-show reservations are auto-cancelled -- no staff / customer tap.
--
-- Policy: a reserved customer who never scans in is moved to 'Voided'
-- automatically once the 15-minute grace period after their scheduled
-- slot has elapsed. The row then shows up in the "Cancelled" tab on both
-- the staff app and the customer's Transaction History with no manual
-- action from anyone. For PAID reservations, the existing
-- issue_voucher_on_void trigger (2026-09_reservation_voucher_credit.sql)
-- turns the forfeited amount into store credit.
--
-- The rule lives in ONE function, called from three places:
--   * pg_cron, every minute  -- authoritative, works with no app open
--   * staff/reservation.tsx  -- on mount + every 60s, for a live Cancelled tab
--   * customer/history.tsx   -- on open + pull-to-refresh
--
-- This repo has no migration tooling; paste this into the Supabase SQL
-- editor to apply.

create or replace function sweep_no_show_reservations()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with voided as (
    update reservation
       set status = 'Voided'
     where status = 'Waiting'
       and arrived_at is null                              -- never scanned in
       and scheduled_at is not null                        -- advance booking, not a walk-in
       and scheduled_at < now() - interval '15 minutes'    -- past the grace period
    returning id
  )
  select count(*) into v_count from voided;
  return v_count;
end;
$$;

-- Any signed-in user may trigger the catch-up sweep -- it only ever moves
-- an objectively-expired Waiting row to Voided. SECURITY DEFINER lets the
-- customer app call it without direct UPDATE rights on `reservation`.
grant execute on function sweep_no_show_reservations() to authenticated;

-- Server-side heartbeat: pure SQL, no pg_net / Vault needed.
create extension if not exists pg_cron;

select cron.unschedule('sweep-no-show-reservations')
where exists (select 1 from cron.job where jobname = 'sweep-no-show-reservations');

select cron.schedule(
  'sweep-no-show-reservations',
  '* * * * *',
  $$ select sweep_no_show_reservations(); $$
);

-- Check:
--   select * from cron.job where jobname = 'sweep-no-show-reservations';
--   select sweep_no_show_reservations();   -- returns how many it just voided
