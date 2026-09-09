-- Reminder / thank-you / cancellation emails for customer reservations.
--
-- What this adds -- four "already sent" guard columns on `reservation`,
-- one per email the scheduled function can send, so none is ever repeated:
--   * reminder_early_sent_at -- the ~60-min "coming up" heads-up
--   * reminder_sent_at       -- the ~30-min "head over now" alert
--   * thank_you_sent_at      -- the post-service "thank you" email
--   * cancel_email_sent_at   -- the "your reservation was cancelled" email
--
-- Plus a pg_cron job that pings the `send-reservation-reminders` Edge
-- Function every 2 minutes. That function:
--   1) emails still-Waiting, not-yet-arrived PAID reservations whose slot
--      is ~60 min away (early) and ~30 min away (final alert),
--   2) emails a thank-you for reservations that just became Completed,
--   3) emails a "cancelled -- store credit issued" notice for PAID
--      reservations that became Voided/Cancelled,
--   4) calls sweep_no_show_reservations() as a backstop (see
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
  add column if not exists thank_you_sent_at      timestamptz,
  add column if not exists cancel_email_sent_at   timestamptz;

-- Makes the "which bookings are due for a reminder" scan cheap.
create index if not exists idx_reservation_reminder_due
  on reservation (scheduled_at)
  where status = 'Waiting' and arrived_at is null and reminder_sent_at is null;

-- ...and the "which completed bookings still need a thank-you" scan.
create index if not exists idx_reservation_thankyou_due
  on reservation (completed_at)
  where status = 'Completed' and thank_you_sent_at is null;

-- ...and the "which cancelled bookings still need the cancel email" scan.
create index if not exists idx_reservation_cancel_email_due
  on reservation (reservation_date)
  where status in ('Voided', 'Cancelled') and cancel_email_sent_at is null;

-- ---------------------------------------------------------------------------
-- 2. Schedule the Edge Function via pg_cron + pg_net
-- ---------------------------------------------------------------------------
-- THIS is what makes the emails automatic. Without it the function only
-- runs when you curl it by hand -- which is exactly why the 30-min
-- reminder / thank-you / cancellation emails never went out.
create extension if not exists pg_cron;
create extension if not exists pg_net;

-- The job authenticates to the function with the project's SERVICE ROLE
-- key. Paste it inline below (replace <SERVICE_ROLE_KEY> -- from
-- Settings -> API -> Project API keys -> service_role). It lives only in
-- the cron.job table, readable solely by the postgres/service role.

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
      'Authorization', 'Bearer <SERVICE_ROLE_KEY>'
    ),
    body    := '{}'::jsonb,
    timeout_milliseconds := 20000
  );
  $$
);

-- ---------------------------------------------------------------------------
-- 3. Verify it's running
-- ---------------------------------------------------------------------------
--   select jobname, schedule, active from cron.job;
--   select status, return_message, start_time
--     from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname = 'reservation-reminders')
--     order by start_time desc limit 10;
-- 'succeeded' rows every ~2 min = the cron is firing.

-- Handy checks:
--   select * from cron.job where jobname = 'reservation-reminders';
--   select * from cron.job_run_details
--     where jobid = (select jobid from cron.job where jobname = 'reservation-reminders')
--     order by start_time desc limit 10;
