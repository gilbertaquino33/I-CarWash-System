-- ============================================================
-- bays.cv_occupied -- "a vehicle is physically in this bay", as seen
-- by the CCTV / YOLO backend (backend/camera.py) and NOTHING else.
--
-- bays.occupied is not reliable for counting cars: besides the camera,
-- it is also set to true by the staff New Walk-in / Reservation screens
-- and by the reservation queue RPCs (a QR scan claims a free bay before
-- the car has even parked). That made "Bays in use" (e.g. 3 / 5) count
-- bays with no car in them.
--
-- occupied / reserved keep their workflow meaning (bay assignment,
-- queueing); the "X / Y bays in use" counters in the app and website
-- read cv_occupied instead. camera.py resets every bay to false on
-- startup and on clean shutdown, since a stopped camera can't vouch for
-- any bay being occupied.
-- ============================================================

alter table public.bays
  add column if not exists cv_occupied boolean not null default false;
