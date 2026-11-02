-- Server-side PUSH reminders (1 hour + 30 minutes before the slot).
--
-- Before this, the 1h/30m phone reminders were LOCAL notifications scheduled
-- on the device at checkout only. They never fired for a booking made on
-- another phone, after a reinstall, or for a row created any other way, and
-- the Expo push token the app fetched (src/app/_layout.tsx) was never saved.
--
-- Now:
--   * the app saves its Expo push token to profiles.expo_push_token via
--     save_my_push_token() whenever a user is signed in;
--   * the send-reservation-reminders Edge Function (already run every 2 min
--     by pg_cron) sends the push alongside the reminder emails, with its own
--     guard columns so a push is never repeated and doesn't depend on the
--     email provider being configured.
--
-- This repo has no migration tooling; paste this into the Supabase SQL
-- editor, then redeploy the function:
--   npx supabase functions deploy send-reservation-reminders --project-ref hybszzpgtbuubdotqkqq

alter table profiles
  add column if not exists expo_push_token text;

alter table reservation
  add column if not exists push_early_sent_at timestamptz,
  add column if not exists push_final_sent_at timestamptz;

-- SECURITY DEFINER so the app needs no general UPDATE right on profiles;
-- a user can only ever set their own token. A token moves to whoever signed
-- in last on that phone, so a shared device doesn't notify the old account.
create or replace function save_my_push_token(p_token text)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if auth.uid() is null then
    raise exception 'NOT_SIGNED_IN';
  end if;

  update profiles set expo_push_token = null
   where expo_push_token = p_token and id <> auth.uid();

  update profiles set expo_push_token = p_token
   where id = auth.uid();
end;
$$;

grant execute on function save_my_push_token(text) to authenticated;
