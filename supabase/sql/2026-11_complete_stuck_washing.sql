-- One-time cleanup: finish every job stuck on "Washing" so it counts in the
-- earnings totals.
--
-- Earnings rule (src/lib/earnings.ts): money only counts when the job is
-- PAID and not cancelled; the dashboards/reports also require
-- status = 'Completed'. So each row below is set to Completed AND paid.
--
-- Paste into the Supabase SQL editor. Run STEP 1 first and check the rows,
-- then run STEP 2.

-- ---------------------------------------------------------------------------
-- STEP 1 -- PREVIEW (changes nothing)
-- ---------------------------------------------------------------------------
select 'reservation' as source, id, customer_name, bay_name, price,
       payment_status, reservation_date, washing_started_at
from reservation
where status = 'Washing'
union all
select 'home_service', id, customer_name, null, price,
       payment_status, scheduled_date, null
from home_service
where status = 'Washing'
order by source, id;

-- ---------------------------------------------------------------------------
-- STEP 2 -- COMPLETE THEM (all-or-nothing)
-- ---------------------------------------------------------------------------
begin;

-- Free the bays those cars were holding.
update bays b
set occupied = false, reserved = false
from reservation r
where r.status = 'Washing'
  and r.bay_name is not null
  and b.shop_id = r.shop_id
  and b.bay_name = r.bay_name;

-- Walk-ins and app bookings.
update reservation
set status         = 'Completed',
    occupied       = false,
    completed_at   = coalesce(completed_at, now()),
    payment_status = 'paid',
    paid_at        = coalesce(paid_at, now())
where status = 'Washing';

-- Home service (uses 'Paid' with a capital P).
update home_service
set status         = 'Completed',
    completed_at   = coalesce(completed_at, now()),
    payment_status = 'Paid',
    paid_at        = coalesce(paid_at, now())
where status = 'Washing';

commit;

-- Check: should return 0.
-- select count(*) from reservation  where status = 'Washing';
-- select count(*) from home_service where status = 'Washing';
