-- Reminder + thank-you emails for customer reservations.
--
-- What this adds -- three "already sent" guard columns on `reservation`,
-- one per email the scheduled function can send, so none is ever repeated:
--   * reminder_early_sent_at -- the ~60-min "coming up" heads-up
--   * reminder_sent_at       -- the ~15-min "head over now" alert
--   * thank_you_sent_at      -- the post-service "thank you" email
--
-- Plus a pg_cron job that pings the `send-reservation-reminders` Edge
-- Function every 2 minutes. That function:
--   1) emails still-Waiting, not-yet-arrived PAID reservations whose slot
--      is ~60 min away (early) and ~15 min away (final alert),
--   2) emails a thank-you for reservations that just became Completed,
--   3) calls sweep_no_show_reservations() as a backstop (see
--      2026-09_reservation_no_show_autocancel.sql) -- that function also
--      has its own every-minute cron and is what actually auto-cancels
--      no-shows / fires the store-credit trigger.
--
-- This repo has no migration tooling; this file is a tracked record of SQL
-- that must ALSO be pasted into the Supabase SQL editor to actually apply,
-- AFTER deploying the function:
--   supabase functions deploy send-reservation-reminders --project-ref hybszzpgtbuubdotqkqq

-- ---------------------------------------------------------------------------
-- 1. Columns + supporting index
-- ---------------------------------------------------------------------------
alter table reservation
  add column if not exists reminder_early_sent_at timestamptz,
  add column if not exists reminder_sent_at       timestamptz,
  add column if not exists thank_you_sent_at      timestamptz;

-- Makes the "which bookings are due for a reminder" scan cheap.
create index if not exists idx_reservation_reminder_due
  on reservation (scheduled_at)
  where status = 'Waiting' and arrived_at is null and reminder_sent_at is null;

-- ...and the "which completed bookings still need a thank-you" scan.
create index if not exists idx_reservation_thankyou_due
  on reservation (completed_at)
  where status = 'Completed' and thank_you_sent_at is null;

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
