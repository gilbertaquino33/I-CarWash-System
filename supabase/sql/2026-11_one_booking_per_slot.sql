-- ============================================================
-- One booking per time slot per shop.
--
-- Before: a slot stayed open until bookings reached the shop's total_bays,
-- and the app counted taken slots with a plain SELECT -- which RLS limits to
-- the customer's OWN bookings, so other customers' bookings were invisible
-- and every slot always looked free.
--
-- Now:
--   * get_booked_slots(shop, date) -- the time slots already taken that day
--     (SECURITY DEFINER, returns only the times, no customer data). The app
--     greys these out.
--   * create_customer_reservation  -- refuses a 2nd booking for the same
--     shop + date + time (NO_SLOT_AVAILABLE). Same as before otherwise.
--   * get_slot_availability        -- capacity is now 1 per slot.
--
-- A cancelled / voided booking frees its slot again.
-- Paste into the Supabase SQL editor to apply.
-- ============================================================

create or replace function get_booked_slots(p_shop_id bigint, p_scheduled_date date)
returns table (scheduled_time text)
language sql stable security definer set search_path = public as $$
  select distinct r.scheduled_time
  from reservation r
  where r.shop_id = p_shop_id
    and r.scheduled_date = p_scheduled_date
    and r.scheduled_time is not null
    and r.status not in ('Cancelled', 'Voided');
$$;

grant execute on function get_booked_slots(bigint, date) to authenticated;

create or replace function get_slot_availability(p_shop_id bigint, p_scheduled_date date, p_scheduled_time text)
returns table (total_bays integer, booked_count integer)
language plpgsql security definer set search_path = public as $$
declare
  v_booked_count int;
begin
  select count(*) into v_booked_count from reservation
  where reservation.shop_id = p_shop_id
    and reservation.scheduled_date = p_scheduled_date
    and reservation.scheduled_time = p_scheduled_time
    and reservation.status not in ('Cancelled', 'Voided');

  -- One booking per slot.
  return query select 1, v_booked_count;
end;
$$;

create or replace function create_customer_reservation(
  p_customer_id uuid, p_shop_id bigint, p_shop_name text, p_customer_name text,
  p_vehicle_type text, p_service_type text, p_price numeric,
  p_payment_method text, p_payment_status text,
  p_scheduled_date date, p_scheduled_time text, p_scheduled_at timestamptz,
  p_payment_reference text default null, p_voucher_amount numeric default 0
)
returns table (id bigint, qr_token uuid, scheduled_at timestamptz, voucher_redeemed numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_booked_count int; v_new_id bigint; v_new_token uuid;
  v_balance numeric; v_redeem numeric;
begin
  -- Serialises bookings for the same shop + date + time.
  perform pg_advisory_xact_lock(
    hashtextextended(p_shop_id::text || p_scheduled_date::text || p_scheduled_time, 0)
  );

  select count(*) into v_booked_count from reservation
  where shop_id = p_shop_id and scheduled_date = p_scheduled_date
    and scheduled_time = p_scheduled_time and status not in ('Cancelled', 'Voided');

  -- One booking per slot: someone already has this time.
  if v_booked_count >= 1 then
    raise exception 'NO_SLOT_AVAILABLE';
  end if;

  -- Redeem store credit (Shopee-style): never more than the balance, never
  -- more than the price. `for update` locks the balance row so two
  -- concurrent bookings can't both spend the same credit.
  v_redeem := 0;
  if coalesce(p_voucher_amount, 0) > 0 then
    select balance into v_balance from customer_voucher
    where customer_id = p_customer_id for update;

    v_redeem := least(coalesce(v_balance, 0), p_voucher_amount, p_price);
    if v_redeem < 0 then v_redeem := 0; end if;

    if v_redeem > 0 then
      update customer_voucher
      set balance = balance - v_redeem, updated_at = now()
      where customer_id = p_customer_id;
    end if;
  end if;

  insert into reservation (
    customer_id, shop_id, shop_name, customer_name, vehicle_type, service_type, price,
    payment_method, payment_status, status, occupied, source, bay_name,
    scheduled_date, scheduled_time, scheduled_at, reservation_date, created_at,
    paid_at, payment_reference, voucher_applied
  ) values (
    p_customer_id, p_shop_id, p_shop_name, p_customer_name, p_vehicle_type, p_service_type, p_price,
    p_payment_method, p_payment_status, 'Waiting', false, 'app', null,
    p_scheduled_date, p_scheduled_time, p_scheduled_at, p_scheduled_date, now(),
    case when p_payment_status = 'paid' then now() else null end,
    p_payment_reference, v_redeem
  )
  returning reservation.id, reservation.qr_token into v_new_id, v_new_token;

  if v_redeem > 0 then
    insert into voucher_transaction (customer_id, amount, reason, reservation_id)
    values (p_customer_id, -v_redeem, 'reservation_redeemed', v_new_id);
  end if;

  return query select v_new_id, v_new_token, p_scheduled_at, v_redeem;
end;
$$;
