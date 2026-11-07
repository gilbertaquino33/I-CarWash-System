-- Shop working hours for staff Time In / Time Out: 7:00 AM to 7:00 PM
-- (Philippine time, checked on the SERVER).
--
--   * Time In is only accepted from 7:00 AM until 7:00 PM.
--   * A shift still open at 7:00 PM is timed out AUTOMATICALLY at 7:00 PM
--     (pg_cron, every 5 minutes) and flagged auto_closed -- so a forgotten
--     Time Out counts the real hours up to closing, never 0.
--   * A Time Out tapped after 7:00 PM is recorded as 7:00 PM.
--   * The hours are per shop (open_time / close_time) in case a branch ever
--     needs different ones; every shop starts at 7 AM - 7 PM.
--
-- Run AFTER 2026-11_staff_attendance.sql. This file replaces
-- 2026-11_staff_attendance_missed_timeout.sql (you don't need to run that
-- one; if you already did, this simply takes over from it).
-- This repo has no migration tooling; paste this into the Supabase SQL editor.

alter table shop_profile_setup
  add column if not exists open_time  time not null default '07:00',
  add column if not exists close_time time not null default '19:00';

-- Kept from the earlier missed-time-out file so the website can read them.
alter table staff_attendance
  add column if not exists edited_by_admin boolean not null default false,
  add column if not exists edited_at       timestamptz,
  add column if not exists admin_note      text;

-- Closing time (as a timestamp) of the PH day a shift started on.
create or replace function shift_closing_time(p_time_in timestamptz, p_close time)
returns timestamptz
language sql
stable
as $$
  select ((p_time_in at time zone 'Asia/Manila')::date + p_close) at time zone 'Asia/Manila';
$$;

-- ---------------------------------------------------------------------------
-- 1. Auto Time Out at closing time
-- ---------------------------------------------------------------------------
create or replace function close_forgotten_shifts()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_count integer;
begin
  with closed as (
    update staff_attendance a
       set time_out = greatest(shift_closing_time(a.time_in, s.close_time), a.time_in),
           auto_closed = true
      from shop_profile_setup s
     where s.id = a.shop_id
       and a.time_out is null
       and now() >= shift_closing_time(a.time_in, s.close_time)
    returning a.id
  )
  select count(*) into v_count from closed;
  return v_count;
end;
$$;

select cron.unschedule('close-forgotten-shifts')
where exists (select 1 from cron.job where jobname = 'close-forgotten-shifts');

select cron.schedule('close-forgotten-shifts', '*/5 * * * *', $$ select close_forgotten_shifts(); $$);

-- ---------------------------------------------------------------------------
-- 2. Time In: only between open_time and close_time (PH)
-- ---------------------------------------------------------------------------
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

  insert into staff_attendance (staff_id, shop_id, time_in_lat, time_in_lng, time_in_distance_m)
  values (auth.uid(), v_shop_id, p_lat, p_lng, round(v_dist)::int)
  returning time_in into v_time_in;

  return v_time_in;
end;
$$;

-- ---------------------------------------------------------------------------
-- 3. Time Out: after closing time it's recorded AS closing time.
--    Returns the time actually recorded.
-- ---------------------------------------------------------------------------
create or replace function staff_time_out(
  p_lat double precision default null,
  p_lng double precision default null,
  p_accuracy double precision default null,
  p_mocked boolean default false
)
returns timestamptz
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift staff_attendance%rowtype;
  v_shop shop_profile_setup%rowtype;
  v_closing timestamptz;
  v_dist integer;
  v_time_out timestamptz;
begin
  select * into v_shift from staff_attendance
   where staff_id = auth.uid() and time_out is null
   for update;

  if not found then
    raise exception 'NOT_TIMED_IN';
  end if;

  select * into v_shop from shop_profile_setup where id = v_shift.shop_id;
  v_closing := shift_closing_time(v_shift.time_in, v_shop.close_time);

  -- Past closing: record closing time (no RAISE here -- that would roll the
  -- update back). The app sees a time out earlier than "now" and says so.
  if now() >= v_closing then
    update staff_attendance
       set time_out = greatest(v_closing, v_shift.time_in), auto_closed = true
     where id = v_shift.id
    returning time_out into v_time_out;
    return v_time_out;
  end if;

  if p_lat is not null and p_lng is not null and v_shop.latitude is not null and not coalesce(p_mocked, false) then
    v_dist := round(distance_m(p_lat, p_lng, v_shop.latitude, v_shop.longitude))::int;
  end if;

  update staff_attendance
     set time_out = now(),
         time_out_lat = p_lat,
         time_out_lng = p_lng,
         time_out_distance_m = v_dist
   where id = v_shift.id
  returning time_out into v_time_out;

  return v_time_out;
end;
$$;

grant execute on function staff_time_in(double precision, double precision, double precision, boolean) to authenticated;
grant execute on function staff_time_out(double precision, double precision, double precision, boolean) to authenticated;

-- Close anything already past closing time right away.
select close_forgotten_shifts();
