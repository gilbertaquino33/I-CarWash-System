-- Customer self-service cancellation.
--
-- Lets a customer cancel their OWN upcoming reservation (still Waiting, not
-- yet checked in) straight from Transaction History -- no need to just
-- no-show. Same outcome as a no-show: the booking becomes 'Cancelled' and,
-- if it was paid, the existing issue_voucher_on_void trigger (see
-- 2026-09_reservation_voucher_credit.sql) converts the amount to store
-- credit.
--
-- SECURITY DEFINER so the customer app needs no direct UPDATE right on
-- `reservation`; the function itself enforces ownership + a safe status.
--
-- This repo has no migration tooling; paste this into the Supabase SQL
-- editor to apply.

create or replace function cancel_my_reservation(p_reservation_id bigint)
returns table (cancelled boolean, credited numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row reservation%rowtype;
begin
  select * into v_row from reservation
   where id = p_reservation_id
   for update;

  if not found then
    raise exception 'RESERVATION_NOT_FOUND';
  end if;

  if v_row.customer_id is distinct from auth.uid() then
    raise exception 'NOT_YOUR_RESERVATION';
  end if;

  -- Only an un-started booking can be self-cancelled. Once staff have
  -- scanned the QR (arrived_at set) or it's past Waiting, it's out of the
  -- customer's hands.
  if v_row.status <> 'Waiting' or v_row.arrived_at is not null then
    raise exception 'NOT_CANCELLABLE';
  end if;

  update reservation
     set status = 'Cancelled'
   where id = p_reservation_id;

  -- The BEFORE UPDATE trigger issue_voucher_on_void has now run: for a paid
  -- booking it credited `price` back to the customer's store credit.
  return query
    select true,
           case when v_row.payment_status = 'paid'
                then coalesce(v_row.price, 0)
                else 0 end;
end;
$$;

grant execute on function cancel_my_reservation(bigint) to authenticated;
