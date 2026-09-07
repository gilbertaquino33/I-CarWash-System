-- Fix: customer reservations were failing to be created entirely.
--
-- checkout.tsx now calls create_customer_reservation(..., p_payment_reference)
-- (added when the GCash/Cash reference number was wired into
-- customer/history.tsx so it survives past the receipt modal), but the RPC
-- itself was never updated to accept that parameter, and `reservation`
-- never got a `payment_reference` column in any tracked migration.
-- Supabase/PostgREST matches an RPC call by its exact named-parameter
-- signature, so calling the function with an unknown p_payment_reference
-- argument fails outright with "Could not find the function ... in the
-- schema cache" -- the row is never inserted at all, and the customer just
-- sees "Reservation Failed".
--
-- Also fixes a pre-existing bug in this same function (present since it
-- was first written, unrelated to payment_reference): it declares
-- `returns table (id bigint, qr_token uuid, scheduled_at timestamptz)`,
-- which makes `id` an implicit PL/pgSQL variable inside the function body.
-- The capacity-check query `where id = p_shop_id` against
-- shop_profile_setup then referenced a bare `id`, which Postgres can no
-- longer resolve unambiguously between that OUT variable and the table's
-- own `id` column -- every call failed with "column reference \"id\" is
-- ambiguous" before the row was ever inserted. Fixed below by qualifying
-- it as `shop_profile_setup.id`.
--
-- This repo has no migration tooling; this file is a tracked record of SQL
-- that must also be pasted into the Supabase SQL editor to actually apply.

alter table reservation
  add column if not exists payment_reference text;

-- Drop the old 12-arg overload so it doesn't linger unused alongside the
-- new 13-arg one below (changing the parameter list creates a distinct
-- overload rather than replacing it in place).
drop function if exists create_customer_reservation(
  uuid, bigint, text, text, text, text, numeric, text, text, date, text, timestamptz
);

create or replace function create_customer_reservation(
  p_customer_id uuid, p_shop_id bigint, p_shop_name text, p_customer_name text,
  p_vehicle_type text, p_service_type text, p_price numeric,
  p_payment_method text, p_payment_status text,
  p_scheduled_date date, p_scheduled_time text, p_scheduled_at timestamptz,
  p_payment_reference text default null
)
returns table (id bigint, qr_token uuid, scheduled_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_total_bays int; v_booked_count int; v_new_id bigint; v_new_token uuid;
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

  insert into reservation (
    customer_id, shop_id, shop_name, customer_name, vehicle_type, service_type, price,
    payment_method, payment_status, status, occupied, source, bay_name,
    scheduled_date, scheduled_time, scheduled_at, reservation_date, created_at,
    paid_at, payment_reference
  ) values (
    p_customer_id, p_shop_id, p_shop_name, p_customer_name, p_vehicle_type, p_service_type, p_price,
    p_payment_method, p_payment_status, 'Waiting', false, 'app', null,
    p_scheduled_date, p_scheduled_time, p_scheduled_at, p_scheduled_date, now(),
    case when p_payment_status = 'paid' then now() else null end,
    p_payment_reference
  )
  returning reservation.id, reservation.qr_token into v_new_id, v_new_token;

  return query select v_new_id, v_new_token, p_scheduled_at;
end;
$$;

grant execute on function create_customer_reservation(
  uuid, bigint, text, text, text, text, numeric, text, text, date, text, timestamptz, text
) to authenticated;
