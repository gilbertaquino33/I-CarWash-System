-- Per-shop CCTV/YOLO live stream URL, editable by the shop admin from the
-- website dashboard (Live Video page). Mirrors the mobile app's admin ->
-- Live Video screen, but stored server-side (not AsyncStorage) so it's the
-- same URL for every browser/session, not just one device.
--
-- This repo has no migration tooling; paste this into the Supabase SQL
-- editor to apply.

alter table shop_profile_setup
  add column if not exists cctv_stream_url text;
