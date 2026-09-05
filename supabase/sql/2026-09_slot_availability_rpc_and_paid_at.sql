-- Two fixes:
--
-- 1) get_slot_availability(): the customer Reserve screen was checking
--    slot capacity by directly querying+counting the `reservation` table
--    as the logged-in customer. That table almost certainly has RLS
--    restricting a customer to their OWN rows (customer_id = auth.uid()),
--    so counting OTHER customers' bookings for the same shop+date+time
--    slot silently returned near-zero -- the badge always showed
--    "N/N slots available" no matter how full the slot actually was.
--    This RPC mirrors the exact same capacity-check logic already used
--    (and already correct, since it's security definer) inside
--    create_customer_reservation, so the pre-booking display now matches
--    the real enforcement exactly.
--
--    Note: this is a DIFFERENT number than the "X/Y slots" shown on the
--    customer dashboard, which reflects live bays.occupied/reserved
--    (bays busy RIGHT NOW). This RPC reflects existing ADVANCE
--    reservations for a specific future date+time slot -- a bay that's
--    busy right now can easily be free again by a slot 2 hours from now,
--    so the two numbers are expected to differ; they answer different
--    questions ("is the shop busy right now" vs "is this future slot
--    already booked up").
--
-- 2) reservation.paid_at: mirrors home_service.paid_at, which reservation
--    never had. Stamped by create_customer_reservation at booking time if
--    payment_status is already 'paid' (GCash), and by the staff app when
--    staff manually flips a Cash-on-Hand reservation to paid.
--
-- This repo has no migration tooling; this file is a tracked record of SQL
-- that must also be pasted into the Supabase SQL editor to actually apply.

alter table reservation
  add column if not exists paid_at timestamptz;

create or replace function get_slot_availability(
  p_shop_id bigint, p_scheduled_date date, p_scheduled_time text
)
returns table (total_bays int, booked_count int)
language plpgsql security definer set search_path = public as $$
declare
  v_total_bays int; v_booked_count int;
begin
  select total_bays into v_total_bays from shop_profile_setup where id = p_shop_id;
  if v_total_bays is null then v_total_bays := 0; end if;

  select count(*) into v_booked_count from reservation
  where shop_id = p_shop_id and scheduled_date = p_scheduled_date
    and scheduled_time = p_scheduled_time and status not in ('Cancelled', 'Voided');

  return query select v_total_bays, v_booked_count;
end;
$$;

grant execute on function get_slot_availability(bigint, date, text) to authenticated, anon;

create or replace function create_customer_reservation(
  p_customer_id uuid, p_shop_id bigint, p_shop_name text, p_customer_name text,
  p_vehicle_type text, p_service_type text, p_price numeric,
  p_payment_method text, p_payment_status text,
  p_scheduled_date date, p_scheduled_time text, p_scheduled_at timestamptz
)
returns table (id bigint, qr_token uuid, scheduled_at timestamptz)
language plpgsql security definer set search_path = public as $$
declare
  v_total_bays int; v_booked_count int; v_new_id bigint; v_new_token uuid;
begin
  perform pg_advisory_xact_lock(
    hashtextextended(p_shop_id::text || p_scheduled_date::text || p_scheduled_time, 0)
  );

  select total_bays into v_total_bays from shop_profile_setup where id = p_shop_id;
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
    paid_at
  ) values (
    p_customer_id, p_shop_id, p_shop_name, p_customer_name, p_vehicle_type, p_service_type, p_price,
    p_payment_method, p_payment_status, 'Waiting', false, 'app', null,
    p_scheduled_date, p_scheduled_time, p_scheduled_at, p_scheduled_date, now(),
    case when p_payment_status = 'paid' then now() else null end
  )
  returning reservation.id, reservation.qr_token into v_new_id, v_new_token;

  return query select v_new_id, v_new_token, p_scheduled_at;
end;
$$;
