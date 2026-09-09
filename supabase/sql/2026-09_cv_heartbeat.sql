-- Camera / CV liveness heartbeat.
--
-- backend/camera.py writes now() here every few seconds while its
-- detection loop is running, and deletes the row on a clean shutdown.
-- The staff New Walk-in screen reads it: if the heartbeat is missing or
-- older than ~90s, the camera is treated as OFFLINE and the screen shows
-- NO live "Washing"/timer state -- so stale reservation rows from a
-- previous camera session can't show a phantom running timer when no CCTV
-- is actually connected.
--
-- This repo has no migration tooling; paste this into the Supabase SQL
-- editor to apply.

create table if not exists cv_heartbeat (
  shop_id    bigint primary key,
  updated_at timestamptz not null default now()
);

-- Only a liveness timestamp, nothing sensitive -- let any client read it
-- (camera.py writes with the project's secret key, which bypasses RLS).
alter table cv_heartbeat disable row level security;
