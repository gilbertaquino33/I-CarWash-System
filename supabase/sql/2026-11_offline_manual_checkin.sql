-- ============================================================
-- Manual mode + offline check-in for reserved customers.
--
-- Problem: a reserved customer could only be checked in while the CCTV
-- (backend/camera.py) was running, because the camera is what starts and
-- ends the wash. A dead CCTV or a brownout meant staff couldn't scan the
-- QR at all -> lost income.
--
-- Now:
--   * staff_manual_check_in  -- QR check-in WITHOUT the camera. The wash is
--     tracked by staff instead (manual_mode = true). Also used to upload
--     check-ins the staff phone saved while it had no internet
--     (p_offline = true, p_at = when it was really scanned).
--   * staff_finish_wash      -- the "Finish Wash" button for manual washes
--     (the camera can't detect the car leaving if it's off).
--   * confirm_reservation_arrival -- unchanged logic, but "today" is now the
--     Philippine date. The DB runs in UTC, so 7:00-7:59 AM PH bookings were
--     rejected as NOT_TODAY.
--
-- Every manual / offline record is flagged (manual_mode, synced_offline)
-- so the admin can see which washes were NOT tracked by the camera.
--
-- Paste into the Supabase SQL editor to apply.
-- ============================================================

alter table public.reservation
  add column if not exists manual_mode boolean not null default false;
alter table public.reservation
  add column if not exists synced_offline boolean not null default false;

-- "Camera is running for this shop" -- same 90 s window the app uses.
create or replace function shop_cctv_online(p_shop_id bigint)
returns boolean
language sql stable security definer set search_path = public as $$
  select exists (
    select 1 from cv_heartbeat
    where shop_id = p_shop_id and updated_at > now() - interval '90 seconds'
  );
$$;

-- Staff phone clock -> trusted time: never in the future, never before the
-- given floor, at most 36 h old (older = phone clock is wrong -> use now()).
create or replace function clamp_staff_time(p_at timestamptz, p_floor timestamptz default null)
returns timestamptz
language sql immutable as $$
  select greatest(
    case
      when p_at is null or p_at > now() or p_at < now() - interval '36 hours' then now()
      else p_at
    end,
    coalesce(p_floor, '-infinity'::timestamptz)
  );
$$;

-- ---------------------------------------------------------------------------
-- 1. Manual / offline QR check-in
-- ---------------------------------------------------------------------------
create or replace function staff_manual_check_in(
  p_qr_token uuid,
  p_at timestamptz default null,
  p_offline boolean default false
)
returns table (reservation_id bigint, status text, is_late boolean, already_checked_in boolean)
language plpgsql security definer set search_path = public as $$
declare
  v_role text; v_shop bigint; v_res reservation%rowtype;
  v_at timestamptz; v_late boolean; v_credit numeric;
  v_grace interval := interval '15 minutes';
begin
  select role, shop_id into v_role, v_shop from profiles where id = auth.uid();
  if v_role is distinct from 'staff' then raise exception 'NOT_STAFF'; end if;

  select * into v_res from reservation where qr_token = p_qr_token for update;
  if not found then raise exception 'QR_NOT_FOUND'; end if;
  if v_res.shop_id is distinct from v_shop then raise exception 'WRONG_SHOP'; end if;

  -- Already checked in (e.g. the same offline scan uploaded twice) -> fine.
  if v_res.arrived_at is not null then
    return query select v_res.id, v_res.status, v_res.is_late, true;
    return;
  end if;

  -- Live (online) manual check-in is only for when the CCTV is really down;
  -- while it runs, the normal camera-tracked check-in must be used.
  if not p_offline and shop_cctv_online(v_shop) then raise exception 'CCTV_ONLINE'; end if;

  v_at := clamp_staff_time(case when p_offline then p_at else now() end);

  if v_res.scheduled_date is distinct from (v_at at time zone 'Asia/Manila')::date then
    raise exception 'NOT_TODAY';
  end if;

  if v_res.status = 'Cancelled' then raise exception 'RESERVATION_INACTIVE'; end if;

  if v_res.status = 'Voided' then
    -- The no-show sweep voided it while the staff phone had no internet. Undo
    -- it ONLY if the customer was really scanned inside the grace period.
    if not p_offline
       or v_res.scheduled_at is null
       or v_at > v_res.scheduled_at + v_grace + interval '2 minutes' then
      raise exception 'RESERVATION_INACTIVE';
    end if;

    -- Take back the store credit the void gave out.
    if coalesce(v_res.voucher_issued, false) and v_res.customer_id is not null then
      select coalesce(sum(amount), 0) into v_credit
      from voucher_transaction
      where voucher_transaction.reservation_id = v_res.id and reason = 'reservation_voided';

      if v_credit > 0 then
        update customer_voucher
           set balance = greatest(balance - v_credit, 0), updated_at = now()
         where customer_id = v_res.customer_id;
        insert into voucher_transaction (customer_id, amount, reason, reservation_id)
        values (v_res.customer_id, -v_credit, 'reservation_reinstated', v_res.id);
      end if;
    end if;
  end if;

  v_late := v_res.scheduled_at is not null and v_at > v_res.scheduled_at + v_grace;

  update reservation
     set status = 'Washing',
         arrived_at = v_at,
         washing_started_at = v_at,
         is_late = v_late,
         manual_mode = true,
         synced_offline = p_offline,
         voucher_issued = false
   where id = v_res.id;

  return query select v_res.id, 'Washing'::text, v_late, false;
end;
$$;

grant execute on function staff_manual_check_in(uuid, timestamptz, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 2. Finish Wash (manual)
-- ---------------------------------------------------------------------------
create or replace function staff_finish_wash(
  p_reservation_id bigint,
  p_at timestamptz default null,
  p_offline boolean default false
)
returns table (reservation_id bigint, status text)
language plpgsql security definer set search_path = public as $$
declare
  v_role text; v_shop bigint; v_res reservation%rowtype;
  v_start timestamptz; v_at timestamptz; v_secs integer;
begin
  select role, shop_id into v_role, v_shop from profiles where id = auth.uid();
  if v_role is distinct from 'staff' then raise exception 'NOT_STAFF'; end if;

  select * into v_res from reservation where id = p_reservation_id for update;
  if not found then raise exception 'NOT_FOUND'; end if;
  if v_res.shop_id is distinct from v_shop then raise exception 'WRONG_SHOP'; end if;

  if v_res.status = 'Completed' then
    return query select v_res.id, v_res.status;
    return;
  end if;
  if v_res.status is distinct from 'Washing' then raise exception 'NOT_WASHING'; end if;

  -- A camera-tracked wash is finished by the camera -- unless it died mid-wash.
  if not v_res.manual_mode and not p_offline and shop_cctv_online(v_shop) then
    raise exception 'CCTV_ONLINE';
  end if;

  v_start := coalesce(v_res.washing_started_at, v_res.arrived_at);
  v_at := clamp_staff_time(case when p_offline then p_at else now() end, v_start);
  v_secs := greatest(0, extract(epoch from (v_at - coalesce(v_start, v_at)))::integer);

  update reservation
     set status = 'Completed',
         occupied = false,
         completed_at = v_at,
         manual_mode = true,
         synced_offline = synced_offline or p_offline,
         service_timer = lpad((v_secs / 3600)::text, 2, '0') || ':' ||
                         lpad(((v_secs % 3600) / 60)::text, 2, '0') || ':' ||
                         lpad((v_secs % 60)::text, 2, '0')
   where id = v_res.id;

  -- Free a bay the QR hold may still point at (the status trigger already
  -- clears occupied/reserved by bay_name).
  update bays
     set occupied = false, reserved = false, reserved_reservation_id = null, updated_at = now()
   where shop_id = v_res.shop_id and reserved_reservation_id = v_res.id;

  update walkin_transactions set completed_at = v_at where walkin_transactions.reservation_id = v_res.id;

  return query select v_res.id, 'Completed'::text;
end;
$$;

grant execute on function staff_finish_wash(bigint, timestamptz, boolean) to authenticated;

-- ---------------------------------------------------------------------------
-- 3. Camera check-in: "today" = Philippine date (was UTC current_date)
-- ---------------------------------------------------------------------------
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
  if v_res.scheduled_date is distinct from (now() at time zone 'Asia/Manila')::date then
    raise exception 'NOT_TODAY';
  end if;

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
    where bays.shop_id = v_res.shop_id and bays.bay_name = v_free_bay;

    update reservation set bay_name = v_free_bay, occupied = true, status = 'Washing', washing_started_at = now()
    where id = v_res.id;

    return query select v_res.id, v_free_bay, 'Washing'::text, v_is_late, false;
  else
    return query select v_res.id, null::text, v_res.status, v_is_late, true;
  end if;
end;
$$;

grant execute on function confirm_reservation_arrival(uuid) to authenticated;
