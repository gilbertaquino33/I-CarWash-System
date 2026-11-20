-- ============================================================
-- Forget what the CCTV detected once it goes offline.
--
-- Rule: a camera walk-in only exists while the camera that saw it is
-- running. When the CCTV is turned off or loses connection (no heartbeat
-- for 90 s), everything it detected is forgotten, so nothing it saw before
-- comes back when it is reconnected:
--   * CV walk-ins still Waiting (no service picked)  -> Cancelled
--   * CV walk-ins still Washing (service picked, paid) -> Completed
--     (the payment is kept; the car is assumed to have left)
--   * bays.cv_occupied -> false, and the bays those walk-ins held are freed
--     unless a reserved customer's QR hold is on them.
-- Customer reservations and staff-added manual walk-ins are NOT touched.
--
-- backend/camera.py does the same thing when it starts
-- (forget_previous_cv_session), which covers a camera that was killed
-- and restarted within 90 s.
--
-- Requires 2026-11_offline_manual_checkin.sql and 2026-11_manual_walkin.sql.
-- Paste into the Supabase SQL editor.
-- ============================================================

create or replace function forget_offline_cv_walkins(p_shop_id bigint default null)
returns integer
language plpgsql security definer set search_path = public as $$
declare
  v_now timestamptz := now();
  v_count integer := 0;
  v_rows integer;
  v_bays text[];
  v_shop bigint;
begin
  for v_shop in
    select distinct r.shop_id
    from reservation r
    where r.customer_id is null
      and r.manual_mode = false
      and r.status in ('Waiting', 'Washing')
      and (p_shop_id is null or r.shop_id = p_shop_id)
  loop
    if shop_cctv_online(v_shop) then
      continue;  -- camera still running: its detections are live
    end if;

    select array_agg(distinct bay_name) into v_bays
    from reservation
    where shop_id = v_shop and customer_id is null and manual_mode = false
      and status in ('Waiting', 'Washing') and bay_name is not null;

    update reservation
       set status = 'Cancelled', occupied = false, completed_at = v_now
     where shop_id = v_shop and customer_id is null and manual_mode = false
       and status = 'Waiting';
    get diagnostics v_rows = row_count;
    v_count := v_count + v_rows;

    with done as (
      update reservation
         set status = 'Completed', occupied = false, completed_at = v_now
       where shop_id = v_shop and customer_id is null and manual_mode = false
         and status = 'Washing'
      returning id
    )
    update walkin_transactions w
       set completed_at = v_now
      from done
     where w.reservation_id = done.id and w.completed_at is null;

    update bays set cv_occupied = false where shop_id = v_shop;

    if v_bays is not null then
      update bays
         set occupied = false
       where shop_id = v_shop and bay_name = any(v_bays) and reserved = false;
    end if;
  end loop;

  return v_count;
end;
$$;

grant execute on function forget_offline_cv_walkins(bigint) to authenticated;

-- Manual walk-ins: forget offline camera leftovers in this bay first, so a
-- stale camera row can never block a free bay with BAY_BUSY.
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

  perform forget_offline_cv_walkins(v_shop);

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

-- Run it every 2 minutes for every shop, so leftovers are forgotten even if
-- nobody opens the app and the camera is never restarted.
select cron.unschedule('forget-offline-cv-walkins')
where exists (select 1 from cron.job where jobname = 'forget-offline-cv-walkins');
select cron.schedule('forget-offline-cv-walkins', '*/2 * * * *', $$ select forget_offline_cv_walkins(); $$);
