-- Real PayMongo GCash for Reservation checkout.
--
-- checkout.tsx used to "pay" via GCash with a client-side setTimeout
-- simulation -- no real GCash/PayMongo call ever happened, even though it
-- immediately marked the reservation as paid. This mirrors what
-- home_service already does for real: create-gcash-source /
-- verify-gcash-payment / paymongo-webhook now also update `reservation`,
-- tracked via these two columns (same shape as the ones already added ad
-- hoc to home_service).
--
-- This repo has no migration tooling; paste this into the Supabase SQL
-- editor to apply.

alter table reservation
  add column if not exists paymongo_source_id text,
  add column if not exists paymongo_payment_id text;
