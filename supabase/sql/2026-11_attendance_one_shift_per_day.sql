-- ============================================================
-- One shift per day: once a staff member has timed out today (Philippine
-- date), they can't time in again until tomorrow.
--
-- Before: timing out at 5 PM and timing in again right after was accepted,
-- opening a 2nd shift the same day.
--
-- Same staff_time_in as 2026-11_staff_attendance_shop_hours.sql plus the
-- ALREADY_TIMED_OUT_TODAY check. Paste into the Supabase SQL editor.
-- ============================================================

create or replace function staff_time_in(
  p_lat double precision,
  p_lng double precision,
  p_accuracy double precision default null,
  p_mocked boolean default false
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shop_id bigint;
  v_role text;
  v_shop shop_profile_setup%rowtype;
  v_now_ph time := (now() at time zone 'Asia/Manila')::time;
  v_today_ph date := (now() at time zone 'Asia/Manila')::date;
  v_dist double precision;
  v_time_in timestamptz;
begin
  select lower(role), shop_id into v_role, v_shop_id from profiles where id = auth.uid();

  if v_role is distinct from 'staff' then
    raise exception 'NOT_STAFF';
  end if;
  if v_shop_id is null then
    raise exception 'NO_SHOP';
  end if;

  select * into v_shop from shop_profile_setup where id = v_shop_id;

  if v_now_ph < v_shop.open_time then
    raise exception 'TOO_EARLY:%', to_char(v_shop.open_time, 'FMHH12:MI AM');
  end if;
  if v_now_ph >= v_shop.close_time then
    raise exception 'TOO_LATE_TODAY:%', to_char(v_shop.close_time, 'FMHH12:MI AM');
  end if;

  if v_shop.latitude is null or v_shop.longitude is null then
    raise exception 'SHOP_LOCATION_NOT_SET';
  end if;
  if coalesce(p_mocked, false) then
    raise exception 'MOCK_LOCATION';
  end if;
  if p_lat is null or p_lng is null then
    raise exception 'LOCATION_REQUIRED';
  end if;

  v_dist := distance_m(p_lat, p_lng, v_shop.latitude, v_shop.longitude);
  if v_dist > v_shop.attendance_radius_m + least(greatest(coalesce(p_accuracy, 0), 0), 100) then
    raise exception 'TOO_FAR:%', round(v_dist)::int;
  end if;

  -- A shift left open from an earlier day: close it at that day's closing time.
  perform close_forgotten_shifts();

  if exists (select 1 from staff_attendance where staff_id = auth.uid() and time_out is null) then
    raise exception 'ALREADY_TIMED_IN';
  end if;

  -- One shift per day: already timed in AND out today -> done until tomorrow.
  if exists (
    select 1 from staff_attendance
    where staff_id = auth.uid()
      and time_out is not null
      and (time_in at time zone 'Asia/Manila')::date = v_today_ph
  ) then
    raise exception 'ALREADY_TIMED_OUT_TODAY';
  end if;

  insert into staff_attendance (staff_id, shop_id, time_in_lat, time_in_lng, time_in_distance_m)
  values (auth.uid(), v_shop_id, p_lat, p_lng, round(v_dist)::int)
  returning time_in into v_time_in;

  return v_time_in;
end;
$$;
