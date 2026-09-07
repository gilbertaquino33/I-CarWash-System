-- Non-refundable reservations now convert to STORE CREDIT ("vouchers").
--
-- Policy change:
--   * checkout.tsx no longer offers "Cash on Hand" -- every customer
--     reservation is prepaid via GCash (payment_status = 'paid').
--   * Reservations stay non-refundable. But instead of the money simply
--     being forfeited when a PAID reservation is Voided/Cancelled (staff
--     void, no-show, or the server-side no-show sweep), the full amount
--     tied up in that reservation is credited back to the customer as a
--     voucher balance.
--   * That balance is spent Shopee-checkout style on the next booking:
--     a forfeited P300 reservation becomes P300 of credit, so booking a
--     P350 slot next time only needs P50 paid via GCash. If the credit
--     covers the whole price, no GCash step happens at all.
--
-- This repo has no migration tooling; this file is a tracked record of SQL
-- that must ALSO be pasted into the Supabase SQL editor to actually apply.

-- ---------------------------------------------------------------------------
-- 1. Balance + ledger
-- ---------------------------------------------------------------------------
create table if not exists customer_voucher (
  customer_id uuid primary key references auth.users (id) on delete cascade,
  balance     numeric not null default 0 check (balance >= 0),
  updated_at  timestamptz not null default now()
);

create table if not exists voucher_transaction (
  id             bigint generated always as identity primary key,
  customer_id    uuid not null references auth.users (id) on delete cascade,
  -- positive  = credit issued to the customer (a voided paid reservation)
  -- negative  = credit redeemed against a new reservation
  amount         numeric not null,
  reason         text not null,               -- 'reservation_voided' | 'reservation_redeemed'
  reservation_id bigint,
  created_at     timestamptz not null default now()
);

create index if not exists voucher_transaction_customer_idx
  on voucher_transaction (customer_id, created_at desc);

alter table customer_voucher   enable row level security;
alter table voucher_transaction enable row level security;

-- A customer may READ only their own balance / ledger. Every write goes
-- through the SECURITY DEFINER trigger + RPC below, never straight from
-- the client.
drop policy if exists customer_voucher_select_own on customer_voucher;
create policy customer_voucher_select_own on customer_voucher
  for select using (customer_id = auth.uid());

drop policy if exists voucher_transaction_select_own on voucher_transaction;
create policy voucher_transaction_select_own on voucher_transaction
  for select using (customer_id = auth.uid());

-- ---------------------------------------------------------------------------
-- 2. reservation columns
-- ---------------------------------------------------------------------------
alter table reservation
  -- how much store credit was redeemed to pay for THIS reservation
  add column if not exists voucher_applied numeric not null default 0,
  -- guard: a reservation updated again after being voided must not credit
  -- the customer's balance a second time.
  add column if not exists voucher_issued boolean not null default false;

-- ---------------------------------------------------------------------------
-- 3. Issue credit when a PAID reservation is voided / cancelled
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
    -- Credit back the full value that was locked into this reservation
    -- (GCash payment + any store credit that was applied to it).
    v_credit := coalesce(new.price, 0);

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

drop trigger if exists trg_issue_voucher_on_void on reservation;
create trigger trg_issue_voucher_on_void
  before update on reservation
  for each row
  execute function issue_voucher_on_void();

-- ---------------------------------------------------------------------------
-- 4. Redeem credit while creating a reservation
-- ---------------------------------------------------------------------------
-- Adds p_voucher_amount to create_customer_reservation and returns the
-- amount actually redeemed. Because the RETURNS TABLE shape changes and the
-- parameter list grows, the previous 13-arg overload is dropped first (a
-- bare CREATE OR REPLACE would leave it lingering as a second overload and
-- PostgREST would not know which to call).
drop function if exists create_customer_reservation(
  uuid, bigint, text, text, text, text, numeric, text, text, date, text, timestamptz, text
);

create or replace function create_customer_reservation(
  p_customer_id uuid, p_shop_id bigint, p_shop_name text, p_customer_name text,
  p_vehicle_type text, p_service_type text, p_price numeric,
  p_payment_method text, p_payment_status text,
  p_scheduled_date date, p_scheduled_time text, p_scheduled_at timestamptz,
  p_payment_reference text default null,
  p_voucher_amount numeric default 0
)
returns table (id bigint, qr_token uuid, scheduled_at timestamptz, voucher_redeemed numeric)
language plpgsql security definer set search_path = public as $$
declare
  v_total_bays int; v_booked_count int; v_new_id bigint; v_new_token uuid;
  v_balance numeric; v_redeem numeric;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_shop_id::text || p_scheduled_date::text || p_scheduled_time, 0)
  );

  select total_bays into v_total_bays from shop_profile_setup where shop_profile_setup.id = p_shop_id;
  if v_total_bays is null then v_total_bays := 0; end if;

  select count(*) into v_booked_count from reservation
  where shop_id = p_shop_id and scheduled_date = p_scheduled_date
    and scheduled_time = p_scheduled_time and status not in ('Cancelled', 'Voided');

  if v_total_bays > 0 and v_booked_count >= v_total_bays then
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

grant execute on function create_customer_reservation(
  uuid, bigint, text, text, text, text, numeric, text, text, date, text, timestamptz, text, numeric
) to authenticated;
