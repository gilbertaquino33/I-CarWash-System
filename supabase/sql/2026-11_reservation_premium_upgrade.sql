-- Customer "Upgrade to Premium Wash".
--
-- A customer who booked a Basic Wash can upgrade it to Premium Wash from
-- My Bookings (customer/history.tsx) any time before the wash is finished
-- (status Waiting or Washing). Only Basic -> Premium is allowed; a Premium
-- booking can never go back to Basic.
--
-- The customer pays only the DIFFERENCE (Premium list price - Basic list
-- price for their vehicle), and pays it AT THE SHOP. Staff see a
-- "+₱X to collect" tag in staff/reservation.tsx and mark it paid there.
--
-- Data model:
--   * reservation.price becomes the new total (Basic + difference), so the
--     sales reports (walkin_transactions, synced from reservation) count the
--     extra earnings with no other change.
--   * addon_amount  = the difference still owed / collected at the shop.
--   * addon_paid_at = when staff confirmed they collected it (null = unpaid).
--   * upgraded_from = the original service ('Basic Wash'), for receipts.
--   Because `price` now includes money that may not have been paid yet, the
--   store-credit trigger and cancel_my_reservation below only credit back
--   what was actually paid.
--
-- This repo has no migration tooling; this file is a tracked record of SQL
-- that must ALSO be pasted into the Supabase SQL editor to actually apply.

-- ---------------------------------------------------------------------------
-- 1. reservation columns
-- ---------------------------------------------------------------------------
alter table reservation
  add column if not exists addon_amount  numeric not null default 0,
  add column if not exists addon_paid_at timestamptz,
  add column if not exists upgraded_from text,
  add column if not exists upgraded_at   timestamptz;

-- ---------------------------------------------------------------------------
-- 2. Server-side price list (copy of src/lib/pricing.ts -- keep in sync).
--    Returns null when the vehicle has no fixed price for that package.
-- ---------------------------------------------------------------------------
create or replace function wash_list_price(p_package text, p_vehicle text)
returns numeric
language sql
immutable
as $$
  select case lower(p_package)
    when 'basic' then
      case p_vehicle
        when 'Motorcycle' then 110 when 'Micro' then 170 when 'Hatchback' then 180
        when 'Sedan' then 200 when 'Coupe' then 200 when 'Convertible' then 220
        when 'Cabriolet' then 220 when 'Wagon' then 210 when 'SUV' then 240
        when 'Pickup' then 240 when 'Crossover' then 240 when 'Sport' then 250
        when 'Muscle' then 250 when 'Roadster' then 250 when 'Off-road' then 270
        when 'Van' then 300 when 'Limousine' then 370
      end
    when 'premium' then
      case p_vehicle
        when 'Motorcycle' then 160 when 'Big Bike' then 300 when 'Micro' then 280
        when 'Hatchback' then 310 when 'Sedan' then 350 when 'Coupe' then 350
        when 'Convertible' then 390 when 'Cabriolet' then 390 when 'Wagon' then 360
        when 'Sport' then 430 when 'Muscle' then 430 when 'Roadster' then 430
        when 'SUV' then 450 when 'Crossover' then 430 when 'Off-road' then 470
        when 'Pickup' then 440 when 'Van' then 500 when 'Limousine' then 600
      end
  end::numeric;
$$;

-- What the customer has actually paid so far for a reservation: the full
-- price, minus an upgrade difference that staff haven't collected yet.
create or replace function reservation_paid_value(r reservation)
returns numeric
language sql
stable
as $$
  select greatest(
    0,
    coalesce(r.price, 0)
      - case when coalesce(r.addon_amount, 0) > 0 and r.addon_paid_at is null
             then r.addon_amount else 0 end
  );
$$;

-- ---------------------------------------------------------------------------
-- 3. The upgrade itself
-- ---------------------------------------------------------------------------
create or replace function upgrade_my_reservation_to_premium(p_reservation_id bigint)
returns table (added numeric, new_price numeric)
language plpgsql
security definer
set search_path = public
as $$
declare
  v_row reservation%rowtype;
  v_basic numeric;
  v_premium numeric;
  v_added numeric;
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

  if v_row.status not in ('Waiting', 'Washing') then
    raise exception 'ALREADY_FINISHED';
  end if;

  -- Basic -> Premium only. Premium (or anything else) can't be changed.
  if coalesce(lower(v_row.service_type), '') not like 'basic%' then
    raise exception 'NOT_BASIC_WASH';
  end if;

  v_basic   := wash_list_price('basic', v_row.vehicle_type);
  v_premium := wash_list_price('premium', v_row.vehicle_type);
  if v_basic is null or v_premium is null then
    raise exception 'NO_PREMIUM_FOR_VEHICLE';
  end if;

  v_added := greatest(0, v_premium - v_basic);

  update reservation
     set service_type  = 'Premium Wash',
         price         = coalesce(price, 0) + v_added,
         addon_amount  = coalesce(addon_amount, 0) + v_added,
         addon_paid_at = null,
         upgraded_from = v_row.service_type,
         upgraded_at   = now()
   where id = p_reservation_id;

  -- If the sales row already exists (synced from reservation), keep it in
  -- step so the reports show the upgraded service and amount.
  update walkin_transactions
     set service_type = 'Premium Wash',
         price        = coalesce(price, 0) + v_added
   where reservation_id = p_reservation_id
     and coalesce(price, 0) > 0;

  return query select v_added, coalesce(v_row.price, 0) + v_added;
end;
$$;

grant execute on function upgrade_my_reservation_to_premium(bigint) to authenticated;

-- ---------------------------------------------------------------------------
-- 4. Store credit: only credit back money that was actually paid
--    (same function as 2026-09_reservation_voucher_credit.sql, new v_credit).
-- ---------------------------------------------------------------------------
create or replace function issue_voucher_on_void()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_credit numeric;
begin
  if new.status in ('Voided', 'Cancelled')
     and old.status is distinct from new.status
     and new.payment_status = 'paid'
     and new.customer_id is not null
     and coalesce(old.voucher_issued, false) = false
  then
    v_credit := reservation_paid_value(new);

    if v_credit > 0 then
      insert into customer_voucher (customer_id, balance, updated_at)
      values (new.customer_id, v_credit, now())
      on conflict (customer_id)
      do update set balance    = customer_voucher.balance + excluded.balance,
                    updated_at = now();

      insert into voucher_transaction (customer_id, amount, reason, reservation_id)
      values (new.customer_id, v_credit, 'reservation_voided', new.id);
    end if;

    new.voucher_issued := true;
  end if;

  return new;
end;
$$;

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

  if v_row.status <> 'Waiting' or v_row.arrived_at is not null then
    raise exception 'NOT_CANCELLABLE';
  end if;

  update reservation
     set status = 'Cancelled'
   where id = p_reservation_id;

  return query
    select true,
           case when v_row.payment_status = 'paid'
                then reservation_paid_value(v_row)
                else 0 end;
end;
$$;

grant execute on function cancel_my_reservation(bigint) to authenticated;
