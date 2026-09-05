-- Track when CV detected the vehicle has left the bay (completion time),
-- separately from `arrived_at` (QR scan time) and `washing_started_at`
-- (bay entry time), which already existed.
--
-- This repo has no migration tooling; this file is a tracked record of SQL
-- that must also be pasted into the Supabase SQL editor to actually apply.
--
-- backend/camera.py's finalize_vehicle() now stamps this column (in
-- addition to walkin_transactions.completed_at, which it already did)
-- every time CV confirms a vehicle has left a bay and flips the
-- reservation to Completed/Cancelled. This applies uniformly to both
-- walk-in and app-reserved rows, since finalize_vehicle only keys off
-- reservation_id, not source.

alter table reservation
  add column if not exists completed_at timestamptz;
