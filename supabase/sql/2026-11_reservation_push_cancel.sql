-- Push notification when a customer's reservation is cancelled (no-show
-- auto-cancel, staff cancel, or the customer's own "Cancel booking").
-- Sent by the send-reservation-reminders Edge Function, which stamps
-- push_cancel_sent_at so the same push never goes out twice.
--
-- This repo has no migration tooling; paste this into the Supabase SQL
-- editor, then redeploy the function:
--   npx supabase functions deploy send-reservation-reminders --project-ref hybszzpgtbuubdotqkqq

alter table reservation
  add column if not exists push_cancel_sent_at timestamptz;

-- Bookings that were already cancelled before this feature existed must
-- not all get a push the first time the function runs.
update reservation
   set push_cancel_sent_at = now()
 where status in ('Voided', 'Cancelled')
   and push_cancel_sent_at is null;
