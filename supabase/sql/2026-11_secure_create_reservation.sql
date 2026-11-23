-- ============================================================
-- Security fix for create_customer_reservation.
--
-- Before this, the function trusted two values sent by the app:
--   * p_payment_status -- any client could send 'paid' and get a PAID
--     booking (and its QR) without paying anything;
--   * p_customer_id   -- any client could pass another customer's id and
--     spend THEIR store credit.
--
-- Now the database decides:
--   * the booking is for the signed-in customer only (auth.uid());
--   * it is 'paid' ONLY when store credit covers the whole price -- then it
--     is recorded as paid by 'Store Credit'. Anything else is 'unpaid' until
--     PayMongo confirms the GCash payment (paymongo-webhook /
--     verify-gcash-payment set it to 'paid').
-- The app and website already send exactly these values, so normal
-- bookings behave the same. Same signature as before.
--
-- Paste into the Supabase SQL editor.
-- ============================================================

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
  v_customer uuid; v_status text; v_method text;
begin
  -- A signed-in customer can only book (and spend credit) for themselves.
  v_customer := coalesce(auth.uid(), p_customer_id);
  if auth.uid() is not null and p_customer_id is distinct from auth.uid() then
    raise exception 'NOT_YOUR_ACCOUNT';
  end if;

  if p_price is null or p_price <= 0 then
    raise exception 'BAD_PRICE';
  end if;

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

  -- Redeem store credit: never more than the balance, never more than the
  -- price. `for update` locks the balance row so two concurrent bookings
  -- can't both spend the same credit.
  v_redeem := 0;
  if coalesce(p_voucher_amount, 0) > 0 then
    select balance into v_balance from customer_voucher
    where customer_id = v_customer for update;

    v_redeem := least(coalesce(v_balance, 0), p_voucher_amount, p_price);
    if v_redeem < 0 then v_redeem := 0; end if;

    if v_redeem > 0 then
      update customer_voucher
      set balance = balance - v_redeem, updated_at = now()
      where customer_id = v_customer;
    end if;
  end if;

  -- The DATABASE decides whether this booking is paid, never the client.
  if v_redeem >= p_price then
    v_status := 'paid';
    v_method := 'Store Credit';
  else
    v_status := 'unpaid';
    v_method := coalesce(nullif(p_payment_method, 'Store Credit'), 'GCash');
  end if;

  insert into reservation (
    customer_id, shop_id, shop_name, customer_name, vehicle_type, service_type, price,
    payment_method, payment_status, status, occupied, source, bay_name,
    scheduled_date, scheduled_time, scheduled_at, reservation_date, created_at,
    paid_at, payment_reference, voucher_applied
  ) values (
    v_customer, p_shop_id, p_shop_name, p_customer_name, p_vehicle_type, p_service_type, p_price,
    v_method, v_status, 'Waiting', false, 'app', null,
    p_scheduled_date, p_scheduled_time, p_scheduled_at, p_scheduled_date, now(),
    case when v_status = 'paid' then now() else null end,
    p_payment_reference, v_redeem
  )
  returning reservation.id, reservation.qr_token into v_new_id, v_new_token;

  if v_redeem > 0 then
    insert into voucher_transaction (customer_id, amount, reason, reservation_id)
    values (v_customer, -v_redeem, 'reservation_redeemed', v_new_id);
  end if;

  return query select v_new_id, v_new_token, p_scheduled_at, v_redeem;
end;
$$;
