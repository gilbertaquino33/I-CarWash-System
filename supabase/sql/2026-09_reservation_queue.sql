-- Reserved-vs-Walk-in Bay Priority, QR Arrival Confirmation, Date/Time Booking
--
-- This repo has no migration tooling; this file is a tracked record of SQL
-- that must also be pasted into the Supabase SQL editor to actually apply.
--
-- Summary:
--   - Booking (create_customer_reservation) no longer locks a bay at booking
--     time -- it only reserves a priority queue slot (source='app',
--     bay_name=NULL) after checking per-slot capacity against total_bays.
--   - confirm_reservation_arrival(qr_token) is called by staff when they scan
--     a customer's QR code. It marks arrival, computes lateness (15 min grace
--     period, informational only -- never blocks the wash), and assigns a
--     free bay immediately if one exists.
--   - claim_bay_for_reserved_or_free(bay_name, shop_id) is called by every
--     code path that frees a bay (backend/camera.py on vehicle departure,
--     staff app on End Session / Complete / Void). It gives first claim on
--     the freed bay to the oldest customer who has arrived but has no bay
--     yet, before opening the bay back up to walk-ins.
--   - reservation.source ('app' | 'walkin') is untouched by all of this --
--     existing earnings reports keep working unchanged.

create extension if not exists pgcrypto;

-- ---------------------------------------------------------------------
-- Schema
-- ---------------------------------------------------------------------

alter table reservation
  add column if not exists scheduled_date date,
  add column if not exists scheduled_time text,
  add column if not exists scheduled_at timestamptz,
  add column if not exists qr_token uuid unique default gen_random_uuid(),
  add column if not exists arrived_at timestamptz,
  add column if not exists is_late boolean not null default false;

create index if not exists idx_reservation_slot_capacity
  on reservation (shop_id, scheduled_date, scheduled_time)
  where status not in ('Cancelled', 'Voided');

create index if not exists idx_reservation_qr_token on reservation (qr_token);

create index if not exists idx_reservation_waiting_queue
  on reservation (shop_id, arrived_at)
  where status = 'Waiting' and bay_name is null and arrived_at is not null;

alter table bays
  add column if not exists reserved_reservation_id bigint references reservation(id);

create index if not exists idx_bays_reserved_reservation on bays (reserved_reservation_id);

-- Note: refund_status / refund_reason columns are intentionally left in
-- place, unused. No migration/rollback tooling exists for this DB -- don't
-- take on irreversible schema risk for what is only a UI-level policy change.

-- ---------------------------------------------------------------------
-- create_customer_reservation: extended with date/time-slot params.
-- No longer touches `bays` at all -- booking only grants a priority queue
-- slot, gated by a per-slot capacity check (advisory-locked to avoid a
-- last-slot double-booking race).
-- ---------------------------------------------------------------------

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
    scheduled_date, scheduled_time, scheduled_at, reservation_date, created_at
  ) values (
    p_customer_id, p_shop_id, p_shop_name, p_customer_name, p_vehicle_type, p_service_type, p_price,
    p_payment_method, p_payment_status, 'Waiting', false, 'app', null,
    p_scheduled_date, p_scheduled_time, p_scheduled_at, p_scheduled_date, now()
  )
  returning reservation.id, reservation.qr_token into v_new_id, v_new_token;

  return query select v_new_id, v_new_token, p_scheduled_at;
end;
$$;

grant execute on function create_customer_reservation(
  uuid, bigint, text, text, text, text, numeric, text, text, date, text, timestamptz
) to authenticated;

-- ---------------------------------------------------------------------
-- confirm_reservation_arrival: staff-only, called on successful QR scan.
-- Idempotent -- a double-scan returns the existing assignment rather than
-- reassigning or erroring.
-- ---------------------------------------------------------------------

create or replace function confirm_reservation_arrival(p_qr_token uuid)
returns table (reservation_id bigint, bay_name text, status text, is_late boolean, waiting_for_bay boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_staff_shop_id bigint; v_staff_role text; v_res reservation%rowtype;
  v_is_late boolean; v_free_bay text; v_grace interval := interval '15 minutes';
begin
  select role, shop_id into v_staff_role, v_staff_shop_id from profiles where id = auth.uid();
  if v_staff_role is distinct from 'staff' then raise exception 'NOT_STAFF'; end if;

  select * into v_res from reservation where qr_token = p_qr_token for update;
  if not found then raise exception 'QR_NOT_FOUND'; end if;
  if v_res.shop_id is distinct from v_staff_shop_id then raise exception 'WRONG_SHOP'; end if;
  if v_res.status in ('Cancelled', 'Voided') then raise exception 'RESERVATION_INACTIVE'; end if;
  if v_res.scheduled_date is distinct from current_date then raise exception 'NOT_TODAY'; end if;

  if v_res.arrived_at is not null then
    return query select v_res.id, v_res.bay_name, v_res.status, v_res.is_late, (v_res.bay_name is null);
    return;
  end if;

  v_is_late := now() > (v_res.scheduled_at + v_grace);
  update reservation set arrived_at = now(), is_late = v_is_late where id = v_res.id;

  select b.bay_name into v_free_bay from bays b
  where b.shop_id = v_res.shop_id and b.occupied = false and b.reserved_reservation_id is null
  order by b.bay_name for update skip locked limit 1;

  if v_free_bay is not null then
    update bays set occupied = true, reserved = true, reserved_reservation_id = v_res.id, updated_at = now()
    where shop_id = v_res.shop_id and bay_name = v_free_bay;

    update reservation set bay_name = v_free_bay, occupied = true, status = 'Washing', washing_started_at = now()
    where id = v_res.id;

    return query select v_res.id, v_free_bay, 'Washing'::text, v_is_late, false;
  else
    return query select v_res.id, null::text, v_res.status, v_is_late, true;
  end if;
end;
$$;

grant execute on function confirm_reservation_arrival(uuid) to authenticated;

-- ---------------------------------------------------------------------
-- claim_bay_for_reserved_or_free: called by every bay-freeing code path
-- instead of directly clearing bays.occupied/reserved. Gives the oldest
-- arrived-but-unassigned reserved customer first claim on the freed bay.
-- Called both by the staff app (real user session) and by backend/camera.py
-- (service-role key, no auth.uid()) -- no role check here on purpose.
-- ---------------------------------------------------------------------

create or replace function claim_bay_for_reserved_or_free(p_bay_name text, p_shop_id bigint)
returns table (claimed_reservation_id bigint, claimed_customer_name text)
language plpgsql security definer set search_path = public as $$
declare v_bay bays%rowtype; v_next_id bigint; v_next_name text;
begin
  select * into v_bay from bays where shop_id = p_shop_id and bay_name = p_bay_name for update;
  if not found then raise exception 'BAY_NOT_FOUND'; end if;

  select id, customer_name into v_next_id, v_next_name from reservation
  where shop_id = p_shop_id and status = 'Waiting' and bay_name is null and arrived_at is not null
  order by arrived_at asc for update skip locked limit 1;

  if v_next_id is not null then
    update bays set occupied = true, reserved = true, reserved_reservation_id = v_next_id, updated_at = now()
    where shop_id = p_shop_id and bay_name = p_bay_name;
    update reservation set bay_name = p_bay_name, occupied = true, status = 'Washing', washing_started_at = now()
    where id = v_next_id;
    return query select v_next_id, v_next_name;
  else
    update bays set occupied = false, reserved = false, reserved_reservation_id = null, updated_at = now()
    where shop_id = p_shop_id and bay_name = p_bay_name;
    return query select null::bigint, null::text;
  end if;
end;
$$;

grant execute on function claim_bay_for_reserved_or_free(text, bigint) to authenticated;
-- service_role (backend/camera.py) bypasses RLS/grants already; no extra
-- grant needed for that caller.

-- ---------------------------------------------------------------------
-- No-show sweep: schedule this via pg_cron (if available on the project's
-- plan) or a scheduled Edge Function running every ~10-15 minutes. A
-- customer who never arrives is voided 2 hours after their scheduled time --
-- this is independent of lateness (a late-but-arrived customer has
-- arrived_at set and is never touched by this).
-- ---------------------------------------------------------------------

-- update reservation
-- set status = 'Voided'
-- where status = 'Waiting' and arrived_at is null and scheduled_at < now() - interval '2 hours';
