-- ============================================================
-- Clear old "ghost" walk-ins that still show Bay 1 / Bay 2 as Occupied
-- (SUV) in New Walk-in. They are camera walk-ins from September that never
-- got finished (the camera was off when the cars left).
--
--   * #370, #372, #373 -- Waiting, never paid      -> deleted
--   * #253            -- Washing, PAID (Sep 10)    -> marked Completed so
--                        the paid wash stays in the earnings history
--   * bays with a leftover `reserved` flag and no reservation -> freed
--
-- Generic version: any walk-in still Waiting/Washing from a PREVIOUS day.
-- Paste into the Supabase SQL editor.
-- ============================================================

begin;

-- Paid but never finished -> Completed (keeps the money in the reports).
update reservation
   set status = 'Completed',
       occupied = false,
       completed_at = coalesce(completed_at, washing_started_at, created_at)
 where customer_id is null
   and status in ('Waiting', 'Washing')
   and payment_status = 'paid'
   and (created_at at time zone 'Asia/Manila')::date < (now() at time zone 'Asia/Manila')::date;

-- Never paid -> remove.
delete from reservation
 where customer_id is null
   and status in ('Waiting', 'Washing')
   and coalesce(payment_status, 'unpaid') <> 'paid'
   and (created_at at time zone 'Asia/Manila')::date < (now() at time zone 'Asia/Manila')::date;

-- Bays still flagged busy with nothing active in them -> free.
update bays b
   set occupied = false, reserved = false, reserved_reservation_id = null, updated_at = now()
 where (b.occupied or b.reserved)
   and not exists (
     select 1 from reservation r
     where r.shop_id = b.shop_id and r.bay_name = b.bay_name and r.status in ('Waiting', 'Washing')
   );

commit;
