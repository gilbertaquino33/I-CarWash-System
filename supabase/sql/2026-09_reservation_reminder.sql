-- 15-minute reminder / no-show alert email for customer reservations.
--
-- What this adds:
--   * reservation.reminder_sent_at -- set once the "your slot is in ~15
--     minutes" email has gone out, so the scheduled function never emails
--     the same booking twice.
--   * A pg_cron job that pings the `send-reservation-reminders` Edge
--     Function every 2 minutes. That function:
--       1) emails every still-Waiting, not-yet-arrived PAID reservation
--          whose slot is <= 15 minutes away and hasn't been reminded,
--       2) voids no-shows (never scanned in) 2 hours after their slot --
--          which fires issue_voucher_on_void (see
--          2026-09_reservation_voucher_credit.sql) and turns the amount
--          into store credit.
--
-- This repo has no migration tooling; this file is a tracked record of SQL
-- that must ALSO be pasted into the Supabase SQL editor to actually apply,
-- AFTER deploying the function:
--   supabase functions deploy send-reservation-reminders --project-ref hybszzpgtbuubdotqkqq

-- ---------------------------------------------------------------------------
-- 1. Column + supporting index
-- ---------------------------------------------------------------------------
alter table reservation
  add column if not exists reminder_sent_at timestamptz;

-- Makes the "which bookings are due for a reminder" scan cheap.
create index if not exists idx_reservation_reminder_due
  on reservation (scheduled_at)
  where status = 'Waiting' and arrived_at is null and reminder_sent_at is null;

-- ---------------------------------------------------------------------------
-- 2. Schedule the Edge Function via pg_cron + pg_net
-- ---------------------------------------------------------------------------
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The cron job calls the function with the project's SERVICE ROLE key. Keep
-- that key out of this tracked file -- store it once in Supabase Vault and
-- let the job read it back at run time:
--
--   select vault.create_secret(
--     '<PASTE SERVICE_ROLE_KEY HERE>',   -- Settings -> API -> service_role
--     'reservation_reminders_service_key'
--   );
--
-- (Re-run with vault.update_secret(id, '<KEY>') if it ever rotates.)

-- Remove any previous copy of the job before (re)creating it.
select cron.unschedule('reservation-reminders')
where exists (select 1 from cron.job where jobname = 'reservation-reminders');

select cron.schedule(
  'reservation-reminders',
  '*/2 * * * *',
  $$
  select net.http_post(
    url     := 'https://hybszzpgtbuubdotqkqq.supabase.co/functions/v1/send-reservation-reminders',
    headers := jsonb_build_object(
      'Content-Type',  'application/json',
      'Authorization', 'Bearer ' || (
        select decrypted_secret from vault.decrypted_secrets
        where name = 'reservation_reminders_service_key'
      )
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- Handy checks:
--   select * from cron.job where jobname = 'reservation-reminders';
--   select * from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname = 'reservation-reminders')
--     order by start_time desc limit 10;
