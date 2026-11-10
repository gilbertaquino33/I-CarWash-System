-- ============================================================
-- One-time cleanup: delete cancelled / no-show reservations that never
-- gave store credit:
--   * never paid, or
--   * paid but cancelled BEFORE the voucher system existed (the owner chose
--     to drop these old records, 2026-11-08).
-- i.e. every Cancelled / Voided row with no voucher issued and no
-- voucher_transaction pointing at it.
--
-- Kept: every cancelled booking that DID give store credit (its voucher
-- history needs it) and every non-cancelled reservation.
--
-- CANNOT be undone. Run step 1 first and check the number (219 on
-- 2026-11-08), then run step 2.
-- Paste into the Supabase SQL editor.
-- ============================================================

-- STEP 1 -- preview: how many will be deleted
select count(*) as will_delete,
       count(*) filter (where payment_status = 'paid') as of_which_paid_before_vouchers
from reservation r
where r.status in ('Cancelled', 'Voided')
  and coalesce(r.voucher_issued, false) = false
  and not exists (
    select 1 from voucher_transaction v
    where v.reservation_id = r.id or v.source_reservation_id = r.id
  );

-- STEP 2 -- delete (all-or-nothing)
begin;

-- A bay can still point at an old reservation; unlink it first.
update bays set reserved_reservation_id = null
where reserved_reservation_id in (
  select r.id from reservation r
  where r.status in ('Cancelled', 'Voided')
    and coalesce(r.voucher_issued, false) = false
);

delete from reservation r
where r.status in ('Cancelled', 'Voided')
  and coalesce(r.voucher_issued, false) = false
  and not exists (
    select 1 from voucher_transaction v
    where v.reservation_id = r.id or v.source_reservation_id = r.id
  );

commit;
