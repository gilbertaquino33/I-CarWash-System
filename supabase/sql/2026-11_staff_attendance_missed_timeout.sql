-- SUPERSEDED by 2026-11_staff_attendance_shop_hours.sql (7 AM - 7 PM working
-- hours; a forgotten shift now ends at 7 PM instead of after 8 hours, and the
-- website no longer has "Fix time out"). Kept only as a record; you don't need
-- to run this file.
--
-- Forgot to time out: no more 0-hour shifts.
--
-- Replaces the old rule (forgotten shift closed with 0 hours) with what most
-- companies do for a missed punch:
--   1. A shift still open 16 hours after Time In is closed AUTOMATICALLY at
--      Time In + the shop's standard shift length (default 8 hours), and
--      flagged auto_closed ("Auto timed out -- needs review").
--      This runs every hour (pg_cron) AND when the staff times in again, so
--      it no longer waits for the next Time In.
--   2. The admin can correct any shift's time out on the website
--      (admin_set_time_out); the row is marked edited_by_admin.
--
-- Run AFTER 2026-11_staff_attendance.sql. This repo has no migration tooling;
-- paste this into the Supabase SQL editor.

alter table shop_profile_setup
  add column if not exists default_shift_hours numeric not null default 8;

alter table staff_attendance
  add column if not exists edited_by_admin boolean not null default false,
  add column if not exists edited_at       timestamptz,
  add column if not exists admin_note      text;

-- ---------------------------------------------------------------------------
-- 1. Auto time out for forgotten shifts
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
       set time_out = least(a.time_in + s.default_shift_hours * interval '1 hour', now()),
           auto_closed = true
      from shop_profile_setup s
     where s.id = a.shop_id
       and a.time_out is null
       and a.time_in < now() - interval '16 hours'
    returning a.id
  )
  select count(*) into v_count from closed;
  return v_count;
end;
$$;

-- Hourly, so a forgotten shift is closed even if the staff never opens the app.
select cron.unschedule('close-forgotten-shifts')
where exists (select 1 from cron.job where jobname = 'close-forgotten-shifts');

select cron.schedule('close-forgotten-shifts', '7 * * * *', $$ select close_forgotten_shifts(); $$);

-- ---------------------------------------------------------------------------
-- 2. Time In: same as before, but a forgotten shift now gets the standard
--    shift length instead of 0 hours.
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
  v_dist double precision;
  v_open staff_attendance%rowtype;
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

  select * into v_open from staff_attendance
   where staff_id = auth.uid() and time_out is null
   for update;

  if found then
    if v_open.time_in > now() - interval '16 hours' then
      raise exception 'ALREADY_TIMED_IN';
    end if;
    -- Forgotten shift: standard shift length, flagged for the admin to review.
    update staff_attendance
       set time_out = least(v_open.time_in + v_shop.default_shift_hours * interval '1 hour', now()),
           auto_closed = true
     where id = v_open.id;
  end if;

  insert into staff_attendance (staff_id, shop_id, time_in_lat, time_in_lng, time_in_distance_m)
  values (auth.uid(), v_shop_id, p_lat, p_lng, round(v_dist)::int)
  returning time_in into v_time_in;

  return v_time_in;
end;
$$;

-- Shifts that were closed with 0 hours by the old rule get the standard
-- length now (still flagged so the admin can correct them).
update staff_attendance a
   set time_out = least(a.time_in + s.default_shift_hours * interval '1 hour', now())
  from shop_profile_setup s
 where s.id = a.shop_id
   and a.auto_closed
   and not a.edited_by_admin
   and a.time_out = a.time_in;

-- ---------------------------------------------------------------------------
-- 3. Admin corrects a time out (website Attendance page)
-- ---------------------------------------------------------------------------
create or replace function admin_set_time_out(
  p_shift_id bigint,
  p_time_out timestamptz,
  p_note text default null
)
returns void
language plpgsql
security definer
set search_path = public
as $$
declare
  v_shift staff_attendance%rowtype;
begin
  select a.* into v_shift
    from staff_attendance a
    join shop_profile_setup s on s.id = a.shop_id
   where a.id = p_shift_id and s.owner_id = auth.uid()
   for update of a;

  if not found then
    raise exception 'NOT_ALLOWED';
  end if;
  if p_time_out <= v_shift.time_in then
    raise exception 'BEFORE_TIME_IN';
  end if;
  if p_time_out > v_shift.time_in + interval '24 hours' or p_time_out > now() then
    raise exception 'TOO_LATE';
  end if;

  update staff_attendance
     set time_out = p_time_out,
         auto_closed = false,
         edited_by_admin = true,
         edited_at = now(),
         admin_note = nullif(trim(coalesce(p_note, '')), '')
   where id = p_shift_id;
end;
$$;

grant execute on function admin_set_time_out(bigint, timestamptz, text) to authenticated;
