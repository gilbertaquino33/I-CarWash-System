-- Staff Time In / Time Out (attendance) with a GPS geofence.
--
-- * Staff tap "Time In" / "Time Out" in the staff app (staff-dashboard.tsx).
--   Both go through SECURITY DEFINER functions that stamp the SERVER clock
--   (now()), so changing the phone's time can't fake hours.
-- * Anti-cheat: the admin saves the shop's exact GPS spot once (Shop Setup ->
--   "Use My Current Location"). Time In is only accepted when the phone's GPS
--   is within the shop radius (default 150 m), and the SERVER computes the
--   distance. Android's "mock location" (fake GPS apps) is rejected.
-- * Time Out is allowed anywhere (so a staff who already left isn't stuck),
--   but the distance is saved and the admin sees "timed out away from shop".
-- * One open shift per staff at a time (partial unique index).
-- * Forgot to time out: on the next Time In, a shift left open for more than
--   16 hours is closed with time_out = time_in (0 hours counted) and flagged
--   auto_closed, so no unworked hours are paid and the admin can see it.
-- * Staff read their own rows; the shop's admin (shop_profile_setup.owner_id)
--   reads every row for that shop. Nobody writes the table directly.
--
-- This repo has no migration tooling; paste this into the Supabase SQL editor.

-- ---------------------------------------------------------------------------
-- 1. Shop location (set by the admin while standing at the shop)
-- ---------------------------------------------------------------------------
alter table shop_profile_setup
  add column if not exists latitude            double precision,
  add column if not exists longitude           double precision,
  add column if not exists attendance_radius_m integer not null default 150;

-- ---------------------------------------------------------------------------
-- 2. Attendance table
-- ---------------------------------------------------------------------------
create table if not exists staff_attendance (
  id                  bigint generated always as identity primary key,
  staff_id            uuid not null references auth.users (id) on delete cascade,
  shop_id             bigint not null,
  time_in             timestamptz not null default now(),
  time_out            timestamptz,
  auto_closed         boolean not null default false,
  time_in_lat         double precision,
  time_in_lng         double precision,
  time_in_distance_m  integer,
  time_out_lat        double precision,
  time_out_lng        double precision,
  time_out_distance_m integer,
  created_at          timestamptz not null default now(),
  check (time_out is null or time_out >= time_in)
);

create unique index if not exists staff_attendance_one_open_shift
  on staff_attendance (staff_id) where time_out is null;

create index if not exists staff_attendance_shop_time_idx
  on staff_attendance (shop_id, time_in desc);

alter table staff_attendance enable row level security;

drop policy if exists staff_attendance_select_own on staff_attendance;
create policy staff_attendance_select_own on staff_attendance
  for select using (staff_id = auth.uid());

drop policy if exists staff_attendance_select_shop_admin on staff_attendance;
create policy staff_attendance_select_shop_admin on staff_attendance
  for select using (
    exists (
      select 1 from shop_profile_setup s
      where s.id = staff_attendance.shop_id and s.owner_id = auth.uid()
    )
  );

-- ---------------------------------------------------------------------------
-- 3. Helpers
-- ---------------------------------------------------------------------------
-- Great-circle distance in meters.
create or replace function distance_m(lat1 double precision, lng1 double precision,
                                      lat2 double precision, lng2 double precision)
returns double precision
language sql
immutable
as $$
  select 2 * 6371000 * asin(sqrt(
    power(sin(radians(lat2 - lat1) / 2), 2) +
    cos(radians(lat1)) * cos(radians(lat2)) * power(sin(radians(lng2 - lng1) / 2), 2)
  ));
$$;

-- Admin saves the shop's GPS spot (must be the shop's owner).
create or replace function set_my_shop_location(p_lat double precision, p_lng double precision)
returns void
language plpgsql
security definer
set search_path = public
as $$
begin
  if p_lat is null or p_lng is null or abs(p_lat) > 90 or abs(p_lng) > 180 then
    raise exception 'BAD_LOCATION';
  end if;

  update shop_profile_setup
     set latitude = p_lat, longitude = p_lng
   where owner_id = auth.uid();

  if not found then
    raise exception 'NO_SHOP';
  end if;
end;
$$;

-- ---------------------------------------------------------------------------
-- 4. Time In (must be at the shop)
-- ---------------------------------------------------------------------------
drop function if exists staff_time_in();

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

  -- Give a little slack for GPS accuracy, but never more than 100 m.
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
    -- Forgotten shift: close it with 0 hours and flag it for the admin.
    update staff_attendance
       set time_out = v_open.time_in, auto_closed = true
     where id = v_open.id;
  end if;

  insert into staff_attendance (staff_id, shop_id, time_in_lat, time_in_lng, time_in_distance_m)
  values (auth.uid(), v_shop_id, p_lat, p_lng, round(v_dist)::int)
  returning time_in into v_time_in;

  return v_time_in;
end;
$$;

-- ---------------------------------------------------------------------------
-- 5. Time Out (allowed anywhere; distance saved for the admin)
-- ---------------------------------------------------------------------------
drop function if exists staff_time_out();

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
  v_shop shop_profile_setup%rowtype;
  v_dist integer;
  v_time_out timestamptz;
begin
  select s.* into v_shop
    from shop_profile_setup s
    join staff_attendance a on a.shop_id = s.id
   where a.staff_id = auth.uid() and a.time_out is null;

  if p_lat is not null and p_lng is not null and v_shop.latitude is not null and not coalesce(p_mocked, false) then
    v_dist := round(distance_m(p_lat, p_lng, v_shop.latitude, v_shop.longitude))::int;
  end if;

  update staff_attendance
     set time_out = now(),
         time_out_lat = p_lat,
         time_out_lng = p_lng,
         -- null = unknown (no GPS or fake GPS) -> admin sees it as unverified
         time_out_distance_m = v_dist
   where staff_id = auth.uid() and time_out is null
  returning time_out into v_time_out;

  if v_time_out is null then
    raise exception 'NOT_TIMED_IN';
  end if;

  return v_time_out;
end;
$$;

grant execute on function set_my_shop_location(double precision, double precision) to authenticated;
grant execute on function staff_time_in(double precision, double precision, double precision, boolean) to authenticated;
grant execute on function staff_time_out(double precision, double precision, double precision, boolean) to authenticated;

-- Live updates for the staff app and admin screens.
do $$
begin
  if not exists (
    select 1 from pg_publication_tables
    where pubname = 'supabase_realtime' and tablename = 'staff_attendance'
  ) then
    alter publication supabase_realtime add table staff_attendance;
  end if;
end $$;
