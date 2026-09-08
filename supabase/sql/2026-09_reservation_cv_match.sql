-- CV confidence that the vehicle sitting in a bay is the one that
-- actually reserved it.
--
-- backend/camera.py decides "reserved arrival" vs "walk-in" the moment a
-- vehicle is CONFIRMED inside a bay:
--
--   * The bay carries a QR hold (bays.reserved_reservation_id, set when
--     staff scanned the customer's QR / when a checked-in customer claimed
--     a freed bay) -> this is the reserved customer. No hold -> walk-in.
--   * The CV-detected body style is then cross-checked against the booked
--     vehicle_type, plus the arrival-time window, to grade how sure we are:
--       high   -> QR hold + exact vehicle-type match + within time window
--       medium -> QR hold + same-family type match, or slightly off-window
--       low    -> QR hold + time window ok but CV body style disagrees
--                 (trusts the human QR scan, but flags it for staff)
--     A wrong type AND wrong time releases the hold -> recorded as walk-in.
--
-- These two columns just persist that grading so staff (and later reports)
-- can see it. Nothing reads them yet; they are write-only breadcrumbs.
--
-- This repo has no migration tooling; paste this into the Supabase SQL
-- editor to apply.

alter table reservation
  -- 'high' | 'medium' | 'low' -- only set on a CV-confirmed RESERVED arrival
  add column if not exists cv_match_confidence text,
  -- the body style camera.py actually saw in the bay, for comparison
  -- against the booked vehicle_type (helps spot CV misclassification)
  add column if not exists cv_detected_vehicle_type text;
