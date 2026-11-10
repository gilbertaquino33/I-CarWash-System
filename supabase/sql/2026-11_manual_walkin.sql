-- ============================================================
-- Manual walk-ins while the CCTV is offline.
--
-- Normally backend/camera.py creates a walk-in row when it sees a car enter
-- a bay; staff then pick the service in the New Walk-in screen. With the
-- CCTV down no row is ever created, so walk-in customers couldn't be
-- recorded (lost income).
--
-- staff_start_manual_walkin: staff picks a vacant bay + vehicle + service;
-- the wash starts right away, paid in cash (same as a camera walk-in), and
-- is flagged manual_mode so the admin can tell it wasn't camera-tracked.
-- The wash is ended with the Finish Wash button -> staff_finish_wash
-- (2026-11_offline_manual_checkin.sql), which also writes the
-- walkin_transactions row via the existing trigger.
--
-- Requires 2026-11_offline_manual_checkin.sql (manual_mode column,
-- shop_cctv_online, staff_finish_wash). Paste into the Supabase SQL editor.
-- ============================================================

alter table public.reservation
  add column if not exists manual_mode boolean not null default false;

create or replace function staff_start_manual_walkin(
  p_bay_name text,
  p_vehicle_type text,
  p_service_type text,   -- 'BASIC' | 'PREMIUM'
  p_price numeric
)
returns table (reservation_id bigint)
language plpgsql security definer set search_path = public as $$
declare
  v_role text; v_shop bigint; v_shop_name text; v_id bigint; v_now timestamptz := now();
begin
  select role, shop_id into v_role, v_shop from profiles where id = auth.uid();
  if v_role is distinct from 'staff' then raise exception 'NOT_STAFF'; end if;

  if shop_cctv_online(v_shop) then raise exception 'CCTV_ONLINE'; end if;
  if p_service_type not in ('BASIC', 'PREMIUM') then raise exception 'BAD_SERVICE'; end if;
  if p_price is null or p_price <= 0 or p_price > 5000 then raise exception 'BAD_PRICE'; end if;

  perform 1 from bays where shop_id = v_shop and bay_name = p_bay_name for update;
  if not found then raise exception 'BAY_NOT_FOUND'; end if;

  if exists (
    select 1 from reservation
    where shop_id = v_shop and bay_name = p_bay_name and status in ('Waiting', 'Washing')
  ) then
    raise exception 'BAY_BUSY';
  end if;

  select shop_name into v_shop_name from shop_profile_setup where id = v_shop;

  insert into reservation (
    customer_id, shop_id, shop_name, customer_name, vehicle_type, service_type, price,
    payment_method, payment_status, paid_at, status, occupied, bay_name, source,
    reservation_date, washing_started_at, created_at, manual_mode
  ) values (
    null, v_shop, v_shop_name, null, p_vehicle_type, p_service_type, p_price,
    'Cash on Hand', 'paid', v_now, 'Washing', true, p_bay_name, 'manual_walkin',
    (v_now at time zone 'Asia/Manila')::date, v_now, v_now, true
  )
  returning id into v_id;

  return query select v_id;
end;
$$;

grant execute on function staff_start_manual_walkin(text, text, text, numeric) to authenticated;
